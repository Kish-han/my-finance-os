
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const debtTypes = [
  "personal_loan",
  "vehicle_loan",
  "credit_card_emi",
  "consumer_durable_emi",
  "external_loan",
  "other",
] as const;

const interestMethods = [
  "reducing_balance",
  "flat_rate",
  "unknown",
] as const;

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

function parsePaise(value: string): number | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;

  const rupees = Number(value);
  const paise = Math.round(rupees * 100);

  if (!Number.isFinite(rupees) || !Number.isSafeInteger(paise)) {
    return null;
  }

  return paise;
}

export async function createEmiDebt(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const lenderName = String(
    formData.get("lenderName") ?? ""
  ).trim();

  const debtType = String(formData.get("debtType") ?? "");
  const interestMethod = String(
    formData.get("interestMethod") ?? "unknown"
  );

  const linkedCreditCardId = String(
    formData.get("linkedCreditCardId") ?? ""
  );
  const paymentAccountId = String(
    formData.get("paymentAccountId") ?? ""
  );

  const originalPrincipalPaise = parsePaise(
    String(formData.get("originalPrincipal") ?? "").trim()
  );

  const outstandingPrincipalPaise = parsePaise(
    String(formData.get("outstandingPrincipal") ?? "").trim()
  );

  const emiAmountPaise = parsePaise(
    String(formData.get("emiAmount") ?? "").trim()
  );

  const totalTenureMonths = Number(
    formData.get("totalTenureMonths")
  );

  const installmentsPaid = Number(
    formData.get("installmentsPaid")
  );

  const interestInput = String(
    formData.get("annualInterestRate") ?? ""
  ).trim();

  const outstandingAsOfDate = String(
    formData.get("outstandingAsOfDate") ?? ""
  );

  const firstEmiDueDate = String(
    formData.get("firstEmiDueDate") ?? ""
  );

  const nextDueDate = String(
    formData.get("nextDueDate") ?? ""
  );

  const interestRate =
    interestInput === "" ? null : Number(interestInput);

  const rateIsValid =
    interestInput === "" ||
    (
      /^\d{1,3}(\.\d{1,2})?$/.test(interestInput) &&
      Number.isFinite(interestRate) &&
      interestRate !== null &&
      interestRate >= 0 &&
      interestRate <= 100
    );

  const rateBasisPoints =
    interestRate === null
      ? null
      : Math.round(interestRate * 100);

  if (
    name.length < 1 ||
    name.length > 100 ||
    lenderName.length < 1 ||
    lenderName.length > 100 ||
    !debtTypes.includes(debtType as (typeof debtTypes)[number]) ||
    !interestMethods.includes(
      interestMethod as (typeof interestMethods)[number]
    ) ||
    (
      debtType === "credit_card_emi" &&
      !linkedCreditCardId
    ) ||
    originalPrincipalPaise === null ||
    originalPrincipalPaise <= 0 ||
    outstandingPrincipalPaise === null ||
    outstandingPrincipalPaise < 0 ||
    emiAmountPaise === null ||
    emiAmountPaise <= 0 ||
    !Number.isInteger(totalTenureMonths) ||
    totalTenureMonths < 1 ||
    totalTenureMonths > 600 ||
    !Number.isInteger(installmentsPaid) ||
    installmentsPaid < 0 ||
    installmentsPaid > totalTenureMonths ||
    !rateIsValid ||
    (
      interestMethod !== "unknown" &&
      interestInput === ""
    ) ||
    !isValidDate(outstandingAsOfDate) ||
    outstandingAsOfDate > indiaToday() ||
    !isValidDate(firstEmiDueDate) ||
    (nextDueDate !== "" && !isValidDate(nextDueDate))
  ) {
    redirect("/emi?error=invalid-input");
  }

  if (rateBasisPoints !== null && rateBasisPoints < 0) {
    redirect("/emi?error=invalid-input");
  }

  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  // Confirm that any linked credit card belongs to this user.
  if (linkedCreditCardId) {
    const { data: card, error: cardError } = await supabase
      .from("credit_cards")
      .select("id")
      .eq("id", linkedCreditCardId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (cardError || !card) {
      redirect("/emi?error=invalid-link");
    }
  }

  // Confirm that any repayment account belongs to this user.
  if (paymentAccountId) {
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", paymentAccountId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (accountError || !account) {
      redirect("/emi?error=invalid-link");
    }
  }

  const { error } = await supabase.from("emi_debts").insert({
    user_id: userId,
    name,
    lender_name: lenderName,
    debt_type: debtType,
    linked_credit_card_id: linkedCreditCardId || null,
    payment_account_id: paymentAccountId || null,
    original_principal_paise: originalPrincipalPaise,
    current_outstanding_principal_paise: outstandingPrincipalPaise,
    outstanding_as_of_date: outstandingAsOfDate,
    annual_interest_rate_basis_points: rateBasisPoints,
    interest_method: interestMethod,
    total_tenure_months: totalTenureMonths,
    installments_paid_before_tracking: installmentsPaid,
    emi_amount_paise: emiAmountPaise,
    first_emi_due_date: firstEmiDueDate,
    next_due_date: nextDueDate || null,
    status: "active",
  });

  if (error) {
    redirect("/emi?error=save-failed");
  }

  revalidatePath("/");
  revalidatePath("/emi");

  redirect("/emi?created=1");
}
