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

function revalidateMoneyTrackerPaths(recordId?: string) {
  revalidatePath("/");
  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/transactions/history");
  revalidatePath("/money-tracker");
  revalidatePath("/money-tracker/given");
  revalidatePath("/money-tracker/taken");
  revalidatePath("/money-tracker/settled");
  revalidatePath("/money-tracker/people");
  if (recordId) {
    revalidatePath(`/money-tracker/${recordId}`);
    revalidatePath(`/money-tracker/agreement/${recordId}`);
  }
}

export interface ActionState {
  error?: string;
  success?: boolean;
}

export async function createRecordAction(
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
  const rawAmount = String(formData.get("amount") ?? formData.get("principal") ?? "").trim();
  const amountPaise = parseRupeesToPaise(rawAmount);
  const accountId = String(formData.get("accountId") ?? "").trim();
  const recordDate = String(formData.get("recordDate") ?? formData.get("agreementDate") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? formData.get("expectedDate") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const allowOverdraft = formData.get("allowOverdraft") === "true";

  if (!personName) {
    return { error: "Person name is required" };
  }

  if (direction !== "given" && direction !== "taken") {
    return { error: "Direction must be either 'given' or 'taken'" };
  }

  if (amountPaise <= 0) {
    return { error: "Amount must be greater than ₹0.00" };
  }

  if (!accountId) {
    return { error: "Please select an account" };
  }

  if (!recordDate || !/^\d{4}-\d{2}-\d{2}$/.test(recordDate)) {
    return { error: "A valid date (YYYY-MM-DD) is required" };
  }

  const { data, error } = await supabase.rpc("create_personal_money_record", {
    p_person_name: personName,
    p_person_phone: personPhone || null,
    p_direction: direction,
    p_amount_paise: amountPaise,
    p_account_id: accountId,
    p_record_date: recordDate,
    p_due_date: dueDate,
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

  const createdId = (data as { record_id?: string })?.record_id;
  revalidateMoneyTrackerPaths(createdId);

  if (direction === "given") {
    redirect("/money-tracker/given");
  } else {
    redirect("/money-tracker/taken");
  }
}

export async function recordRepaymentAction(
  _prevState: ActionState | null,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required" };
  }

  const recordId = String(formData.get("recordId") ?? formData.get("agreementId") ?? "").trim();
  const rawAmount = String(formData.get("paymentAmount") ?? formData.get("amount") ?? "").trim();
  const paymentAmountPaise = parseRupeesToPaise(rawAmount);

  const accountId = String(formData.get("accountId") ?? "").trim();
  const repaymentDate = String(formData.get("paymentDate") ?? formData.get("repaymentDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const allowOverdraft = formData.get("allowOverdraft") === "true";

  if (!recordId) {
    return { error: "Record ID is required" };
  }

  if (paymentAmountPaise <= 0) {
    return { error: "Repayment amount must be greater than ₹0.00" };
  }

  if (!accountId) {
    return { error: "Please select an account" };
  }

  if (!repaymentDate || !/^\d{4}-\d{2}-\d{2}$/.test(repaymentDate)) {
    return { error: "A valid repayment date (YYYY-MM-DD) is required" };
  }

  const { error } = await supabase.rpc("record_personal_money_repayment", {
    p_record_id: recordId,
    p_amount_paise: paymentAmountPaise,
    p_account_id: accountId,
    p_repayment_date: repaymentDate,
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

  revalidateMoneyTrackerPaths(recordId);
  return { success: true };
}

export async function deleteRecordAction(
  prevStateOrFormData?: ActionState | FormData | null,
  maybeFormData?: FormData
): Promise<ActionState | void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication required" };
  }

  const formData =
    prevStateOrFormData instanceof FormData
      ? prevStateOrFormData
      : maybeFormData instanceof FormData
      ? maybeFormData
      : new FormData();

  const recordId = String(formData.get("recordId") ?? formData.get("agreementId") ?? "").trim();
  if (!recordId) {
    return { error: "Record ID is required" };
  }

  // Deletion must execute exclusively through the database RPC.
  // Direct table mutations on personal_money_records and personal_money_repayments are disallowed.
  const { error } = await supabase.rpc("delete_personal_money_record", {
    p_record_id: recordId,
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

  revalidateMoneyTrackerPaths(recordId);
  redirect("/money-tracker");
}

// Backwards compatibility aliases
export const createAgreementAction = createRecordAction;
export const recordPaymentAction = recordRepaymentAction;
export const deleteAgreementAction = deleteRecordAction;
