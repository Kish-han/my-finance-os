"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function fail(message: string, debtId?: string): never {
  const target = debtId
    ? `/emi/foreclosure?debt_id=${encodeURIComponent(debtId)}&error=${encodeURIComponent(message)}`
    : `/emi/foreclosure?error=${encodeURIComponent(message)}`;
  redirect(target);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function indiaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export async function executeForeclosureSettlement(formData: FormData) {
  const supabase = await createClient();

  // Verify the signed-in user.
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string" || !userId) {
    redirect("/login");
  }

  const debtId = String(formData.get("debt_id") ?? "").trim();
  const paymentAccountId = String(
    formData.get("payment_account_id") ?? ""
  ).trim();
  const paymentDate = String(formData.get("payment_date") ?? "").trim();
  const amountInput = String(formData.get("amount_rupees") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!debtId) {
    fail("Select the loan you wish to foreclose.");
  }

  if (!paymentAccountId) {
    fail("Select the bank or cash account used for the payoff.", debtId);
  }

  if (!isValidDate(paymentDate)) {
    fail("Enter a valid payment date (YYYY-MM-DD).", debtId);
  }

  if (paymentDate > indiaToday()) {
    fail("The payment date cannot be in the future.", debtId);
  }

  if (!amountInput || !/^\d{1,12}(\.\d{1,2})?$/.test(amountInput)) {
    fail("Enter a valid payoff amount in Rupees.", debtId);
  }

  const amountRupees = Number(amountInput);
  const amountPaise = Math.round(amountRupees * 100);

  if (
    !Number.isFinite(amountRupees) ||
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    fail("The payoff amount must be a positive valid number.", debtId);
  }

  // 1. Verify debt ownership and active status (prevents duplicate submissions)
  const { data: debt, error: debtError } = await supabase
    .from("emi_debts")
    .select(
      "id, name, status, current_outstanding_principal_paise, outstanding_as_of_date"
    )
    .eq("id", debtId)
    .eq("user_id", userId)
    .maybeSingle();

  if (debtError || !debt) {
    fail("The selected loan could not be found.");
  }

  if (debt.status !== "active") {
    fail("This loan is no longer active or has already been settled.", debtId);
  }

  if (paymentDate < debt.outstanding_as_of_date) {
    fail(
      "The foreclosure payment date cannot be earlier than the loan's outstanding balance snapshot date.",
      debtId
    );
  }

  // 2. Verify payment account ownership
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, name, opening_balance_date")
    .eq("id", paymentAccountId)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .maybeSingle();

  if (accountError || !account) {
    fail("The selected paying account was not found or is archived.", debtId);
  }

  if (paymentDate < account.opening_balance_date) {
    fail(
      "The payment date cannot precede the paying account's opening balance date.",
      debtId
    );
  }

  // 3. Compute estimated remaining principal to attribute principal component correctly
  const { data: payments } = await supabase
    .from("emi_payments")
    .select("debt_id, payment_date, principal_component_paise")
    .eq("debt_id", debtId)
    .order("payment_date", { ascending: true });

  const principalRepaidAfterSnapshot = (payments ?? [])
    .filter((p) => p.payment_date > debt.outstanding_as_of_date)
    .reduce((sum, p) => sum + Number(p.principal_component_paise ?? 0), 0);

  const estimatedPrincipalPaise = Math.max(
    0,
    Number(debt.current_outstanding_principal_paise) -
      principalRepaidAfterSnapshot
  );

  // The principal component cannot exceed the amount paid (ledger constraint).
  // Any amount above principal represents charges, interest, or prepayment fees.
  const principalComponentPaise = Math.min(
    estimatedPrincipalPaise,
    amountPaise
  );

  // 4. Record the settlement via atomic PostgreSQL RPC
  const { error: rpcError } = await supabase.rpc("record_emi_payment", {
    p_debt_id: debt.id,
    p_payment_date: paymentDate,
    p_installment_number: null,
    p_payment_kind: "foreclosure_settlement",
    p_amount_paise: amountPaise,
    p_principal_component_paise: principalComponentPaise,
    p_interest_component_paise: null,
    p_charges_paise: null,
    p_payment_method: "foreclosure",
    p_payment_account_id: account.id,
    p_billed_to_credit_card_id: null,
    p_notes: notes
      ? `Foreclosure settlement: ${notes}`
      : "Foreclosure settlement paid in full",
  });

  if (rpcError) {
    console.error("Foreclosure RPC execution error:", rpcError);
    fail(
      rpcError.message ||
        "The foreclosure payment could not be saved. Please check account details and try again.",
      debtId
    );
  }

  revalidatePath("/");
  revalidatePath("/emi");
  revalidatePath("/emi/foreclosure");
  revalidatePath("/transactions");
  revalidatePath("/accounts");

  redirect("/emi?foreclosed=1");
}

export async function saveForeclosureQuote(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string" || !userId) {
    redirect("/login");
  }

  const debtId = String(formData.get("debt_id") ?? "").trim();
  const quoteDate = String(formData.get("quote_date") ?? "").trim();
  const validUntil = String(formData.get("valid_until") ?? "").trim();
  const source = String(formData.get("source") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!debtId) fail("Select a loan.");

  if (!isValidDate(quoteDate)) {
    fail("Enter a valid quote date.");
  }

  if (!isValidDate(validUntil)) {
    fail("Enter a valid quote expiry date.");
  }

  if (validUntil < quoteDate) {
    fail("The expiry date cannot be before the quote date.");
  }

  if (!["lender_quote", "estimate"].includes(source)) {
    fail("Select a valid quote source.");
  }

  const { data: debt, error: debtError } = await supabase
    .from("emi_debts")
    .select("id, status")
    .eq("id", debtId)
    .eq("user_id", userId)
    .maybeSingle();

  if (debtError || !debt) {
    fail("The selected loan could not be found.");
  }

  if (debt.status !== "active") {
    fail("Only active loans can have a new foreclosure quote saved.");
  }

  const readRupeesLocal = (val: FormDataEntryValue | null, label: string) => {
    const text = String(val ?? "").trim();
    if (!text || !/^\d+(\.\d{1,2})?$/.test(text)) {
      fail(`Enter a valid ${label} amount.`);
    }
    const rupees = Number(text);
    const paise = Math.round(rupees * 100);
    if (!Number.isSafeInteger(paise) || paise < 0) {
      fail(`${label} amount is invalid or too large.`);
    }
    return paise;
  };

  const principal = readRupeesLocal(
    formData.get("outstanding_principal_rupees"),
    "outstanding principal"
  );
  const foreclosureCharges = readRupeesLocal(
    formData.get("foreclosure_charges_rupees"),
    "foreclosure charges"
  );
  const taxes = readRupeesLocal(formData.get("tax_rupees"), "tax");
  const otherCharges = readRupeesLocal(
    formData.get("other_charges_rupees"),
    "other charges"
  );
  const waivers = readRupeesLocal(
    formData.get("waivers_rupees"),
    "waiver"
  );

  if (principal <= 0) {
    fail("Outstanding principal must be greater than ₹0.");
  }

  const totalPayoff = Math.max(
    0,
    principal + foreclosureCharges + taxes + otherCharges - waivers
  );

  const { error: insertError } = await supabase
    .from("emi_foreclosure_quotes")
    .insert({
      user_id: userId,
      debt_id: debtId,
      quote_date: quoteDate,
      valid_until: validUntil,
      outstanding_principal_paise: principal,
      foreclosure_charges_paise: foreclosureCharges,
      tax_paise: taxes,
      other_charges_paise: otherCharges,
      waivers_paise: waivers,
      total_payoff_paise: totalPayoff,
      source,
      notes,
    });

  if (insertError) {
    console.error("Foreclosure quote insert failed:", insertError.message);
    fail(
      "Could not save the quote. Please check your inputs and try again."
    );
  }

  revalidatePath("/emi");
  revalidatePath("/emi/payments");
  revalidatePath("/emi/foreclosure");

  redirect("/emi/foreclosure?created=1");
}
