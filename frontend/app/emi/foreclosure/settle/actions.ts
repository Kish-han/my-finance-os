"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(
    `/emi/foreclosure/settle?error=${encodeURIComponent(message)}`,
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function todayInIndia(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export async function recordActualForeclosure(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || typeof userId !== "string" || !userId) {
    redirect("/login");
  }

  const quoteId = String(formData.get("quote_id") ?? "").trim();
  const accountId = String(formData.get("payment_account_id") ?? "").trim();
  const paymentDate = String(formData.get("payment_date") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!quoteId) fail("Select an official lender quote.");
  if (!accountId) fail("Select the account used to pay the lender.");

  if (!isValidDate(paymentDate)) {
    fail("Enter a valid payment date.");
  }

  if (paymentDate > todayInIndia()) {
    fail("The actual foreclosure payment date cannot be in the future.");
  }

  const { data: quote, error: quoteError } = await supabase
    .from("emi_foreclosure_quotes")
    .select(
      "id,debt_id,quote_date,valid_until,outstanding_principal_paise,total_payoff_paise,source",
    )
    .eq("id", quoteId)
    .eq("user_id", userId)
    .maybeSingle();

  if (quoteError || !quote) {
    fail("The selected foreclosure quote could not be found.");
  }

  if (quote.source !== "lender_quote") {
    fail("An estimate cannot be used to record an actual foreclosure.");
  }

  if (paymentDate < quote.quote_date || paymentDate > quote.valid_until) {
    fail(
      "The payment date falls outside this lender quote's validity period. Save a current official quote first.",
    );
  }

  const { data: debt, error: debtError } = await supabase
    .from("emi_debts")
    .select("id,status,outstanding_as_of_date")
    .eq("id", quote.debt_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (debtError || !debt) {
    fail("The loan linked to this quote could not be found.");
  }

  if (debt.status !== "active") {
    fail("This loan is no longer active.");
  }

  if (paymentDate <= debt.outstanding_as_of_date) {
    fail(
      "The payment date must be after the loan's outstanding balance snapshot date.",
    );
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .maybeSingle();

  if (accountError || !account) {
    fail("The selected account could not be found or is archived.");
  }

  const amountPaise = Number(quote.total_payoff_paise);
  const principalPaise = Number(quote.outstanding_principal_paise);

  if (
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0 ||
    !Number.isSafeInteger(principalPaise) ||
    principalPaise < 0
  ) {
    fail("The quote contains an invalid payoff amount.");
  }

  // Use the saved official quote's payoff total as the actual payment.
  // Cap the principal component at the amount paid to satisfy the ledger rule.
  const principalComponentPaise = Math.min(
    principalPaise,
    amountPaise,
  );

  const { error: paymentError } = await supabase.rpc(
    "record_emi_payment",
    {
      p_debt_id: quote.debt_id,
      p_payment_date: paymentDate,
      p_installment_number: null,
      p_payment_kind: "foreclosure_settlement",
      p_amount_paise: amountPaise,
      p_principal_component_paise: principalComponentPaise,
      p_interest_component_paise: null,
      p_charges_paise: null,
      p_payment_method: "foreclosure",
      p_payment_account_id: accountId,
      p_billed_to_credit_card_id: null,
      p_notes: [
        `Actual foreclosure settled against official quote ${quote.id}.`,
        notes,
      ]
        .filter(Boolean)
        .join(" "),
    },
  );

  if (paymentError) {
    console.error(
      "Actual foreclosure recording failed:",
      paymentError.message,
    );
    fail(
      "The foreclosure payment could not be recorded. Check the payment date, account balance and quote details, then try again.",
    );
  }

  revalidatePath("/");
  revalidatePath("/emi");
  revalidatePath("/emi/payments");
  revalidatePath("/emi/foreclosure");
  revalidatePath("/emi/foreclosure/settle");
  revalidatePath("/transactions");
  revalidatePath("/accounts");

  redirect("/emi/foreclosure/settle?created=1");
}