"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function readRupees(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();

  if (!text) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN;

  const rupees = Number(text);
  if (!Number.isFinite(rupees)) return NaN;

  return Math.round(rupees * 100);
}

function readPositiveInteger(
  value: FormDataEntryValue | null,
): number | null {
  const text = String(value ?? "").trim();

  if (!text) return null;

  const number = Number(text);
  if (!Number.isInteger(number) || number < 1) return NaN;

  return number;
}

function fail(message: string): never {
  redirect(`/emi/payments?error=${encodeURIComponent(message)}`);
}

export async function recordEmiPayment(formData: FormData) {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const debtId = String(formData.get("debt_id") ?? "").trim();
  const paymentDate = String(formData.get("payment_date") ?? "").trim();
  const paymentKind = String(formData.get("payment_kind") ?? "").trim();
  const paymentMethod = String(formData.get("payment_method") ?? "").trim();

  const amount = readRupees(formData.get("amount_rupees"));
  const principal = readRupees(formData.get("principal_rupees"));
  const interest = readRupees(formData.get("interest_rupees"));
  const chargesRaw = readRupees(formData.get("charges_rupees"));
  const charges = chargesRaw ?? 0;
  const installmentNumber = readPositiveInteger(
    formData.get("installment_number"),
  );

  const selectedAccount =
    String(formData.get("payment_account_id") ?? "").trim() || null;
  const selectedCard =
    String(formData.get("billed_to_credit_card_id") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!debtId) fail("Select a loan.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
    fail("Enter a valid payment date.");
  }

  const parsedDate = new Date(`${paymentDate}T00:00:00Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== paymentDate
  ) {
    fail("Enter a valid payment date.");
  }

  if (!["scheduled_emi", "extra_principal", "fee_only", "foreclosure_settlement"].includes(paymentKind)) {
    fail("Select a valid payment type.");
  }

  if (!["bank_debit", "billed_to_credit_card", "manual_external", "foreclosure"].includes(paymentMethod)) {
    fail("Select a valid payment method.");
  }

  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    fail("Enter a payment amount greater than ₹0.");
  }

  for (const [label, value] of [
    ["Principal", principal],
    ["Interest", interest],
    ["Charges", charges],
  ] as const) {
    if (
      value === null && label !== "Principal" && label !== "Interest"
    ) {
      fail(`Enter a valid ${label.toLowerCase()} amount.`);
    }

    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      fail(`${label} cannot be negative or invalid.`);
    }
  }

  if (
    (principal ?? 0) + (interest ?? 0) + charges > amount
  ) {
    fail("Principal, interest and charges cannot exceed the total payment.");
  }

  if (paymentKind === "scheduled_emi" && installmentNumber === null) {
    fail("Enter the scheduled instalment number.");
  }

  if (installmentNumber !== null && !Number.isFinite(installmentNumber)) {
    fail("Enter a valid instalment number.");
  }

  if (
    paymentKind === "scheduled_emi" &&
    installmentNumber === null
  ) {
    fail("Enter the scheduled instalment number.");
  }

  if (
    paymentKind === "foreclosure_settlement" &&
    paymentMethod !== "foreclosure"
  ) {
    fail("Choose Foreclosure as the payment method.");
  }

  if (
    paymentMethod === "foreclosure" &&
    paymentKind !== "foreclosure_settlement"
  ) {
    fail("Choose Foreclosure settlement as the payment type.");
  }

  if (
    ["bank_debit", "foreclosure"].includes(paymentMethod) &&
    !selectedAccount
  ) {
    fail("Select the bank or cash account used for payment.");
  }

  if (paymentMethod === "billed_to_credit_card" && !selectedCard) {
    fail("Select the credit card used for payment.");
  }

  const { error } = await supabase.rpc("record_emi_payment", {
    p_debt_id: debtId,
    p_payment_date: paymentDate,
    p_installment_number:
      paymentKind === "scheduled_emi" ? installmentNumber : null,
    p_payment_kind: paymentKind,
    p_amount_paise: amount,
    p_principal_component_paise: principal,
    p_interest_component_paise: interest,
    p_charges_paise: charges,
    p_payment_method: paymentMethod,
    p_payment_account_id:
      ["bank_debit", "foreclosure"].includes(paymentMethod)
        ? selectedAccount
        : null,
    p_billed_to_credit_card_id:
      paymentMethod === "billed_to_credit_card" ? selectedCard : null,
    p_notes: notes,
  });

  if (error) {
    fail(error.message || "The payment could not be saved.");
  }

  revalidatePath("/");
  revalidatePath("/emi");
  revalidatePath("/emi/payments");
  revalidatePath("/transactions");
  revalidatePath("/cards");
  revalidatePath("/cards/activity");

  redirect("/emi/payments?created=1");
}