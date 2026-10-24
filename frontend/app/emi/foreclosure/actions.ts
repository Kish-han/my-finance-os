"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function fail(message: string): never {
  redirect(`/emi/foreclosure?error=${encodeURIComponent(message)}`);
}

function readRupees(
  value: FormDataEntryValue | null,
  label: string,
): number {
  const text = String(value ?? "").trim();

  if (!text || !/^\d+(\.\d{1,2})?$/.test(text)) {
    fail(`Enter a valid ${label} amount.`);
  }

  const rupees = Number(text);
  const paise = Math.round(rupees * 100);

  if (!Number.isSafeInteger(paise) || paise < 0) {
    fail(`${label} amount is invalid or too large.`);
  }

  return paise;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export async function saveForeclosureQuote(formData: FormData) {
  const supabase = await createClient();

  // Verify the signed-in user.
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

  // Confirm that this loan belongs to the signed-in user.
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

  const principal = readRupees(
    formData.get("outstanding_principal_rupees"),
    "outstanding principal",
  );

  const foreclosureCharges = readRupees(
    formData.get("foreclosure_charges_rupees"),
    "foreclosure charges",
  );

  const taxes = readRupees(
    formData.get("tax_rupees"),
    "tax",
  );

  const otherCharges = readRupees(
    formData.get("other_charges_rupees"),
    "other charges",
  );

  const waivers = readRupees(
    formData.get("waivers_rupees"),
    "waiver",
  );

  if (principal <= 0) {
    fail("Outstanding principal must be greater than ₹0.");
  }

  const totalPayoff = Math.max(
    0,
    principal + foreclosureCharges + taxes + otherCharges - waivers,
  );

  // IMPORTANT: user_id is included so the insert satisfies the ownership
  // requirement enforced by Supabase Row-Level Security.
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
      "Could not save the quote. Please check your inputs and try again.",
    );
  }

  revalidatePath("/emi");
  revalidatePath("/emi/payments");
  revalidatePath("/emi/foreclosure");

  redirect("/emi/foreclosure?created=1");
}