"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function parseRupeesToPaise(value: string | null | undefined): number {
  if (!value) return 0;
  const clean = value.replace(/,/g, "").trim();
  const num = Number(clean);
  if (Number.isNaN(num) || num <= 0) return 0;
  return Math.round(num * 100);
}

function revalidateMoneyTrackerPaths(agreementId?: string) {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/transactions/history");
  revalidatePath("/money-tracker");
  revalidatePath("/money-tracker/given");
  revalidatePath("/money-tracker/taken");
  revalidatePath("/money-tracker/settled");
  revalidatePath("/money-tracker/people");
  if (agreementId) {
    revalidatePath(`/money-tracker/agreement/${agreementId}`);
  }
}

export interface ActionState {
  error?: string;
  success?: boolean;
}

export async function createAgreementAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required" };
  }

  const personName = String(formData.get("personName") ?? "").trim();
  const personPhone = String(formData.get("personPhone") ?? "").trim();
  const direction = String(formData.get("direction") ?? "").trim();
  const rawPrincipal = String(formData.get("principal") ?? "").trim();
  const principalPaise = parseRupeesToPaise(rawPrincipal);
  const accountId = String(formData.get("accountId") ?? "").trim();
  const agreementDate = String(formData.get("agreementDate") ?? "").trim();
  const expectedDate = String(formData.get("expectedDate") ?? "").trim() || null;
  const interestType = String(formData.get("interestType") ?? "none").trim();
  const rawInterestRate = String(formData.get("interestRate") ?? "").trim();
  const rawAgreedInterest = String(formData.get("agreedInterest") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const allowOverdraft = formData.get("allowOverdraft") === "true";

  if (!personName) {
    return { error: "Person name is required" };
  }

  if (direction !== "given" && direction !== "taken") {
    return { error: "Direction must be either 'given' or 'taken'" };
  }

  if (principalPaise <= 0) {
    return { error: "Principal amount must be greater than ₹0.00" };
  }

  if (!accountId) {
    return { error: "Please select an account" };
  }

  if (!agreementDate || !/^\d{4}-\d{2}-\d{2}$/.test(agreementDate)) {
    return { error: "A valid agreement date (YYYY-MM-DD) is required" };
  }

  let interestRateBps = 0;
  let agreedInterestPaise = 0;

  if (interestType === "simple_annual") {
    const ratePercent = Number(rawInterestRate);
    if (Number.isNaN(ratePercent) || ratePercent < 0) {
      return { error: "Annual interest rate must be a non-negative number" };
    }
    interestRateBps = Math.round(ratePercent * 100);
  } else if (interestType === "fixed_amount") {
    agreedInterestPaise = parseRupeesToPaise(rawAgreedInterest);
    if (agreedInterestPaise < 0) {
      return { error: "Fixed interest amount cannot be negative" };
    }
  }

  const { data, error } = await supabase.rpc("create_personal_loan_agreement", {
    p_person_name: personName,
    p_person_phone: personPhone || null,
    p_direction: direction,
    p_principal_paise: principalPaise,
    p_account_id: accountId,
    p_agreement_date: agreementDate,
    p_expected_date: expectedDate,
    p_interest_type: interestType,
    p_interest_rate_bps: interestRateBps,
    p_agreed_interest_paise: agreedInterestPaise,
    p_notes: notes,
    p_allow_overdraft: allowOverdraft,
  });

  if (error) {
    if (error.message?.includes("function") && error.message?.includes("does not exist")) {
      return {
        error:
          "Database migration 20261110000000_create_money_tracker.sql must be applied to Supabase before using Money Tracker.",
      };
    }
    return { error: error.message };
  }

  const createdId = (data as { loan_id?: string })?.loan_id;
  revalidateMoneyTrackerPaths(createdId);

  if (direction === "given") {
    redirect("/money-tracker/given");
  } else {
    redirect("/money-tracker/taken");
  }
}

export async function recordPaymentAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required" };
  }

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  const rawAmount = String(formData.get("paymentAmount") ?? "").trim();
  const paymentAmountPaise = parseRupeesToPaise(rawAmount);

  const rawPrincipal = String(formData.get("principalComponent") ?? "").trim();
  const rawInterest = String(formData.get("interestComponent") ?? "").trim();

  let principalPaise = parseRupeesToPaise(rawPrincipal);
  const interestPaise = parseRupeesToPaise(rawInterest);

  // If component inputs are omitted or blank, default all to principal
  if (principalPaise === 0 && interestPaise === 0 && paymentAmountPaise > 0) {
    principalPaise = paymentAmountPaise;
  }

  const accountId = String(formData.get("accountId") ?? "").trim();
  const paymentDate = String(formData.get("paymentDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const allowOverdraft = formData.get("allowOverdraft") === "true";

  if (!agreementId) {
    return { error: "Agreement ID is required" };
  }

  if (paymentAmountPaise <= 0) {
    return { error: "Payment amount must be greater than ₹0.00" };
  }

  if (principalPaise + interestPaise !== paymentAmountPaise) {
    return {
      error: `Principal component (₹${(principalPaise / 100).toFixed(2)}) + Interest component (₹${(interestPaise / 100).toFixed(2)}) must equal total payment (₹${(paymentAmountPaise / 100).toFixed(2)})`,
    };
  }

  if (!accountId) {
    return { error: "Please select an account" };
  }

  if (!paymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    return { error: "A valid payment date (YYYY-MM-DD) is required" };
  }

  const { error } = await supabase.rpc("record_personal_loan_payment", {
    p_loan_id: agreementId,
    p_payment_amount_paise: paymentAmountPaise,
    p_principal_paise: principalPaise,
    p_interest_paise: interestPaise,
    p_account_id: accountId,
    p_payment_date: paymentDate,
    p_notes: notes,
    p_allow_overdraft: allowOverdraft,
  });

  if (error) {
    if (error.message?.includes("function") && error.message?.includes("does not exist")) {
      return {
        error:
          "Database migration 20261110000000_create_money_tracker.sql must be applied to Supabase before using Money Tracker.",
      };
    }
    return { error: error.message };
  }

  revalidateMoneyTrackerPaths(agreementId);
  return { success: true };
}

export async function deleteAgreementAction(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const agreementId = String(formData.get("agreementId") ?? "").trim();
  if (!agreementId) {
    return;
  }

  // Fetch linked transaction id first so we can remove ledger entry
  const { data: loan } = await supabase
    .from("personal_loans")
    .select("id, linked_transaction_id")
    .eq("id", agreementId)
    .single();

  // Also fetch payments' linked transaction ids
  const { data: payments } = await supabase
    .from("personal_loan_payments")
    .select("linked_transaction_id")
    .eq("personal_loan_id", agreementId);

  // Delete agreement (cascades payments)
  await supabase.from("personal_loans").delete().eq("id", agreementId);

  // Clean up linked transactions
  const txIdsToDelete: string[] = [];
  if (loan?.linked_transaction_id) {
    txIdsToDelete.push(loan.linked_transaction_id);
  }
  if (payments) {
    for (const p of payments) {
      if (p.linked_transaction_id) {
        txIdsToDelete.push(p.linked_transaction_id);
      }
    }
  }

  if (txIdsToDelete.length > 0) {
    await supabase.from("transactions").delete().in("id", txIdsToDelete);
  }

  revalidateMoneyTrackerPaths(agreementId);
  redirect("/money-tracker");
}
