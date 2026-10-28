
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { calculateStandardEmiPaise } from "@/lib/finance/amortization";
import {
  validateAdditionalCharges,
  embedChargesInNotes,
} from "@/lib/finance/emi-charges";

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
    formData.get("lender_name") ?? formData.get("lenderName") ?? ""
  ).trim();

  const debtType = String(
    formData.get("debt_type") ?? formData.get("debtType") ?? ""
  );
  const interestMethod = String(
    formData.get("interest_method") ??
      formData.get("interestMethod") ??
      "unknown"
  );

  const linkedCreditCardId = String(
    formData.get("linked_credit_card_id") ??
      formData.get("linkedCreditCardId") ??
      ""
  );
  const paymentAccountId = String(
    formData.get("payment_account_id") ??
      formData.get("paymentAccountId") ??
      ""
  );

  const originalPrincipalPaise = parsePaise(
    String(
      formData.get("original_principal_rupees") ??
        formData.get("originalPrincipal") ??
        ""
    ).trim()
  );

  let outstandingPrincipalPaise = parsePaise(
    String(
      formData.get("current_outstanding_principal_rupees") ??
        formData.get("outstandingPrincipal") ??
        ""
    ).trim()
  );

  let emiAmountPaise = parsePaise(
    String(
      formData.get("emi_amount_rupees") ?? formData.get("emiAmount") ?? ""
    ).trim()
  );

  const totalTenureMonths = Number(
    formData.get("total_tenure_months") ?? formData.get("totalTenureMonths")
  );

  const installmentsPaid = Number(
    formData.get("installments_paid_before_tracking") ??
      formData.get("installmentsPaid") ??
      "0"
  );

  const interestInput = String(
    formData.get("annual_interest_rate_percent") ??
      formData.get("annualInterestRate") ??
      ""
  ).trim();

  const outstandingAsOfDate = String(
    formData.get("outstanding_as_of_date") ??
      formData.get("outstandingAsOfDate") ??
      indiaToday()
  );

  const firstEmiDueDate = String(
    formData.get("first_emi_due_date") ??
      formData.get("firstEmiDueDate") ??
      ""
  );

  const nextDueDate = String(
    formData.get("next_due_date") ?? formData.get("nextDueDate") ?? ""
  );

  const notes = String(formData.get("notes") ?? "").trim() || null;

  const chargesRupeesInput = formData.get("additional_charges_rupees");
  const chargeDescInput = formData.get("charge_description");
  const chargeValidation = validateAdditionalCharges(
    chargesRupeesInput,
    chargeDescInput
  );

  if (!chargeValidation.isValid) {
    redirect("/emi?error=invalid-input");
  }

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

  // Auto-fill outstanding principal if starting fresh
  if (
    outstandingPrincipalPaise === null &&
    originalPrincipalPaise !== null &&
    installmentsPaid === 0
  ) {
    outstandingPrincipalPaise = originalPrincipalPaise;
  }

  // Auto-calculate monthly EMI if formula terms are known and not explicitly given
  if (
    (emiAmountPaise === null || emiAmountPaise <= 0) &&
    originalPrincipalPaise !== null &&
    Number.isInteger(totalTenureMonths) &&
    totalTenureMonths > 0
  ) {
    emiAmountPaise = calculateStandardEmiPaise(
      originalPrincipalPaise,
      rateBasisPoints ?? 0,
      totalTenureMonths
    );
  }

  if (
    name.length < 1 ||
    name.length > 120 ||
    lenderName.length < 1 ||
    lenderName.length > 120 ||
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

  const baseDebtRecord = {
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
    status: "active" as const,
  };

  const { error: insertError } = await supabase.from("emi_debts").insert({
    ...baseDebtRecord,
    additional_charges_paise: chargeValidation.chargesPaise,
    charge_description: chargeValidation.description,
    notes,
  });

  if (insertError) {
    // If schema cache on live DB does not have additional_charges_paise yet, fallback gracefully to notes
    if (
      insertError.message?.includes("additional_charges_paise") ||
      insertError.message?.includes("charge_description") ||
      insertError.code === "PGRST204"
    ) {
      const fallbackNotes = embedChargesInNotes(
        notes,
        chargeValidation.chargesPaise,
        chargeValidation.description
      );
      const { error: fallbackError } = await supabase
        .from("emi_debts")
        .insert({
          ...baseDebtRecord,
          notes: fallbackNotes,
        });

      if (fallbackError) {
        redirect("/emi?error=save-failed");
      }
    } else {
      redirect("/emi?error=save-failed");
    }
  }

  // If converting revolving card dues to EMI, record card conversion adjustment to release revolving dues
  if (
    formData.get("convert_existing_dues") === "true" &&
    debtType === "credit_card_emi" &&
    linkedCreditCardId
  ) {
    await supabase.from("transactions").insert({
      user_id: userId,
      transaction_date: outstandingAsOfDate,
      description: `EMI Conversion Adjustment · ${name}`,
      amount_paise: originalPrincipalPaise,
      transaction_type: "card_payment",
      from_account_id: null, // No bank debit
      credit_card_id: linkedCreditCardId,
    });
  }

  revalidatePath("/");
  revalidatePath("/emi");
  revalidatePath("/cards");
  revalidatePath("/cards/activity");
  revalidatePath("/transactions");

  redirect("/emi?created=1");
}

export async function updateEmiDebt(formData: FormData) {
  const debtId = String(formData.get("debt_id") ?? "").trim();
  if (!debtId) {
    redirect("/emi?error=invalid-loan");
  }

  const supabase = await createClient();
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  // Confirm ownership of the existing loan
  const { data: existingDebt, error: fetchError } = await supabase
    .from("emi_debts")
    .select("id, user_id, status")
    .eq("id", debtId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError || !existingDebt) {
    redirect("/emi?error=unauthorized-loan");
  }

  const name = String(formData.get("name") ?? "").trim();
  const lenderName = String(
    formData.get("lender_name") ?? formData.get("lenderName") ?? ""
  ).trim();

  const debtType = String(
    formData.get("debt_type") ?? formData.get("debtType") ?? ""
  );
  const interestMethod = String(
    formData.get("interest_method") ??
      formData.get("interestMethod") ??
      "unknown"
  );

  const linkedCreditCardId = String(
    formData.get("linked_credit_card_id") ??
      formData.get("linkedCreditCardId") ??
      ""
  );
  const paymentAccountId = String(
    formData.get("payment_account_id") ??
      formData.get("paymentAccountId") ??
      ""
  );

  const originalPrincipalPaise = parsePaise(
    String(
      formData.get("original_principal_rupees") ??
        formData.get("originalPrincipal") ??
        ""
    ).trim()
  );

  let outstandingPrincipalPaise = parsePaise(
    String(
      formData.get("current_outstanding_principal_rupees") ??
        formData.get("outstandingPrincipal") ??
        ""
    ).trim()
  );

  let emiAmountPaise = parsePaise(
    String(
      formData.get("emi_amount_rupees") ?? formData.get("emiAmount") ?? ""
    ).trim()
  );

  const totalTenureMonths = Number(
    formData.get("total_tenure_months") ?? formData.get("totalTenureMonths")
  );

  const installmentsPaid = Number(
    formData.get("installments_paid_before_tracking") ??
      formData.get("installmentsPaid") ??
      "0"
  );

  const interestInput = String(
    formData.get("annual_interest_rate_percent") ??
      formData.get("annualInterestRate") ??
      ""
  ).trim();

  const outstandingAsOfDate = String(
    formData.get("outstanding_as_of_date") ??
      formData.get("outstandingAsOfDate") ??
      indiaToday()
  );

  const firstEmiDueDate = String(
    formData.get("first_emi_due_date") ??
      formData.get("firstEmiDueDate") ??
      ""
  );

  const nextDueDate = String(
    formData.get("next_due_date") ?? formData.get("nextDueDate") ?? ""
  );

  const notes = String(formData.get("notes") ?? "").trim() || null;

  const chargesRupeesInput = formData.get("additional_charges_rupees");
  const chargeDescInput = formData.get("charge_description");
  const chargeValidation = validateAdditionalCharges(
    chargesRupeesInput,
    chargeDescInput
  );

  if (!chargeValidation.isValid) {
    redirect(`/emi/edit?debt_id=${debtId}&error=invalid-input`);
  }

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

  // Auto-fill outstanding principal if starting fresh
  if (
    outstandingPrincipalPaise === null &&
    originalPrincipalPaise !== null &&
    installmentsPaid === 0
  ) {
    outstandingPrincipalPaise = originalPrincipalPaise;
  }

  // Auto-calculate monthly EMI if formula terms are known and not explicitly given
  if (
    (emiAmountPaise === null || emiAmountPaise <= 0) &&
    originalPrincipalPaise !== null &&
    Number.isInteger(totalTenureMonths) &&
    totalTenureMonths > 0
  ) {
    emiAmountPaise = calculateStandardEmiPaise(
      originalPrincipalPaise,
      rateBasisPoints ?? 0,
      totalTenureMonths
    );
  }

  if (
    name.length < 1 ||
    name.length > 120 ||
    lenderName.length < 1 ||
    lenderName.length > 120 ||
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
    redirect(`/emi/edit?debt_id=${debtId}&error=invalid-input`);
  }

  if (rateBasisPoints !== null && rateBasisPoints < 0) {
    redirect(`/emi/edit?debt_id=${debtId}&error=invalid-input`);
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
      redirect(`/emi/edit?debt_id=${debtId}&error=invalid-link`);
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
      redirect(`/emi/edit?debt_id=${debtId}&error=invalid-link`);
    }
  }

  const baseUpdateRecord = {
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
  };

  const { error: updateError } = await supabase
    .from("emi_debts")
    .update({
      ...baseUpdateRecord,
      additional_charges_paise: chargeValidation.chargesPaise,
      charge_description: chargeValidation.description,
      notes,
    })
    .eq("id", debtId)
    .eq("user_id", userId);

  if (updateError) {
    if (
      updateError.message?.includes("additional_charges_paise") ||
      updateError.message?.includes("charge_description") ||
      updateError.code === "PGRST204"
    ) {
      const fallbackNotes = embedChargesInNotes(
        notes,
        chargeValidation.chargesPaise,
        chargeValidation.description
      );
      const { error: fallbackError } = await supabase
        .from("emi_debts")
        .update({
          ...baseUpdateRecord,
          notes: fallbackNotes,
        })
        .eq("id", debtId)
        .eq("user_id", userId);

      if (fallbackError) {
        redirect(`/emi/edit?debt_id=${debtId}&error=save-failed`);
      }
    } else {
      redirect(`/emi/edit?debt_id=${debtId}&error=save-failed`);
    }
  }

  revalidatePath("/");
  revalidatePath("/emi");
  revalidatePath("/emi/schedule");
  revalidatePath("/emi/payments");
  revalidatePath("/transactions");

  redirect("/emi?updated=1");
}
