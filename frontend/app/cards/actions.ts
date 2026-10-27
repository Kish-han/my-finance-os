
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isValidCardNetwork } from "@/lib/finance/card-networks";

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

function parseOptionalDay(value: string): number | null | undefined {
  if (!value) return null;
  if (!/^\d{1,2}$/.test(value)) return undefined;

  const day = Number(value);

  return Number.isInteger(day) && day >= 1 && day <= 31
    ? day
    : undefined;
}

function parseRupees(value: string): number | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;

  const rupees = Number(value);
  const paise = Math.round(rupees * 100);

  if (
    !Number.isFinite(rupees) ||
    !Number.isSafeInteger(paise) ||
    paise < 0
  ) {
    return null;
  }

  return paise;
}

export async function createCreditCard(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const cardholderName = String(formData.get("cardholderName") ?? "").trim();
  const cardNetwork = String(formData.get("cardNetwork") ?? "").trim();
  const lastFourDigits = String(
    formData.get("lastFourDigits") ?? ""
  ).trim();

  const creditLimitInput = String(
    formData.get("creditLimit") ?? ""
  ).trim();

  const outstandingInput = String(
    formData.get("openingOutstanding") ?? ""
  ).trim();

  const openingDate = String(
    formData.get("openingOutstandingDate") ?? ""
  ).trim();

  const statementDayInput = String(
    formData.get("statementDay") ?? ""
  ).trim();

  const dueDayInput = String(
    formData.get("paymentDueDay") ?? ""
  ).trim();

  const creditLimitPaise = parseRupees(creditLimitInput);
  const openingOutstandingPaise = parseRupees(outstandingInput);

  const statementDay = parseOptionalDay(statementDayInput);
  const paymentDueDay = parseOptionalDay(dueDayInput);

  if (
    name.length < 1 ||
    name.length > 80 ||
    bankName.length < 1 ||
    bankName.length > 100 ||
    cardholderName.length < 1 ||
    cardholderName.length > 100 ||
    !isValidCardNetwork(cardNetwork) ||
    (lastFourDigits !== "" &&
      !/^\d{4}$/.test(lastFourDigits)) ||
    creditLimitPaise === null ||
    creditLimitPaise <= 0 ||
    openingOutstandingPaise === null ||
    !isValidDate(openingDate) ||
    openingDate > indiaToday() ||
    statementDay === undefined ||
    paymentDueDay === undefined
  ) {
    redirect("/cards?error=invalid-input");
  }

  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const { error } = await supabase
    .from("credit_cards")
    .insert({
      user_id: userId,
      name,
      bank_name: bankName,
      cardholder_name: cardholderName,
      card_network: cardNetwork,
      last_four_digits: lastFourDigits || null,
      credit_limit_paise: creditLimitPaise,
      opening_outstanding_paise: openingOutstandingPaise,
      opening_outstanding_date: openingDate,
      statement_day: statementDay,
      payment_due_day: paymentDueDay,
    });

  if (error) {
    redirect("/cards?error=save-failed");
  }

  revalidatePath("/");
  revalidatePath("/cards");

  redirect("/cards?created=1");
}
