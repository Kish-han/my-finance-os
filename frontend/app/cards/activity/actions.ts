
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateCreditCardChargeLimit } from "@/lib/finance/card-limit-engine";

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

function parseAmountPaise(value: string): number | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value)) return null;

  const rupees = Number(value);
  const paise = Math.round(rupees * 100);

  if (
    !Number.isFinite(rupees) ||
    !Number.isSafeInteger(paise) ||
    paise <= 0
  ) {
    return null;
  }

  return paise;
}

function validateCommonFields(
  description: string,
  amountPaise: number | null,
  date: string
): boolean {
  return (
    description.length >= 1 &&
    description.length <= 160 &&
    amountPaise !== null &&
    isValidDate(date) &&
    date <= indiaToday()
  );
}

async function getSignedInUserId() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;

  if (error || typeof userId !== "string") {
    redirect("/login");
  }

  return { supabase, userId };
}

function refreshFinancialPages() {
  revalidatePath("/");
  revalidatePath("/cards");
  revalidatePath("/cards/activity");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
}

// A card purchase increases card debt and spending.
// It does not immediately reduce a bank account balance.
export async function createCardPurchase(formData: FormData) {
  const description = String(
    formData.get("description") ?? ""
  ).trim();

  const categoryName = String(
    formData.get("category") ?? ""
  ).trim();

  const creditCardId = String(
    formData.get("creditCardId") ?? ""
  );

  const amountPaise = parseAmountPaise(
    String(formData.get("amount") ?? "").trim()
  );

  const transactionDate = String(
    formData.get("transactionDate") ?? ""
  ).trim();

  if (
    amountPaise === null ||
    !validateCommonFields(description, amountPaise, transactionDate) ||
    !creditCardId ||
    categoryName.length < 1 ||
    categoryName.length > 60
  ) {
    redirect("/cards/activity?error=invalid-input");
  }

  const { supabase, userId } = await getSignedInUserId();

  const { data: card, error: cardError } = await supabase
    .from("credit_cards")
    .select("id, opening_outstanding_date, credit_limit_paise, opening_outstanding_paise")
    .eq("id", creditCardId)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .maybeSingle();

  if (
    cardError ||
    !card ||
    transactionDate < card.opening_outstanding_date
  ) {
    redirect("/cards/activity?error=invalid-card-or-date");
  }

  // Enforce credit card limit invariant
  const [txResult, emiResult] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, transaction_date, amount_paise, transaction_type, credit_card_id")
      .eq("user_id", userId)
      .eq("credit_card_id", card.id),
    supabase
      .from("emi_debts")
      .select("id, linked_credit_card_id, current_outstanding_principal_paise, status")
      .eq("user_id", userId)
      .eq("linked_credit_card_id", card.id)
      .eq("status", "active"),
  ]);

  const limitValidation = validateCreditCardChargeLimit({
    card,
    transactions: txResult.data ?? [],
    cardLinkedEmis: emiResult.data ?? [],
    chargeAmountPaise: amountPaise,
  });

  if (!limitValidation.allowed) {
    const errParams = new URLSearchParams({
      error: "credit-limit-exceeded",
      limit: String(limitValidation.creditLimitPaise),
      available: String(limitValidation.currentAvailablePaise),
      exceeded: String(limitValidation.exceededByPaise),
      amount: String(amountPaise),
    });
    redirect(`/cards/activity?${errParams.toString()}`);
  }

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .upsert(
      {
        user_id: userId,
        name: categoryName,
        category_type: "expense",
        is_archived: false,
      },
      {
        onConflict: "user_id,category_type,name",
      }
    )
    .select("id")
    .single();

  if (categoryError || !category || amountPaise === null) {
    redirect("/cards/activity?error=save-failed");
  }

  const { error: insertError } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      transaction_date: transactionDate,
      description,
      amount_paise: amountPaise,
      transaction_type: "card_purchase",
      credit_card_id: card.id,
      category_id: category.id,
    });

  if (insertError) {
    redirect("/cards/activity?error=save-failed");
  }

  refreshFinancialPages();
  redirect("/cards/activity?created=purchase");
}

// A card repayment reduces the paying account and card debt.
// It is not counted as another expense.
export async function createCardPayment(formData: FormData) {
  const description =
    String(formData.get("description") ?? "").trim() ||
    "Credit card repayment";

  const creditCardId = String(
    formData.get("creditCardId") ?? ""
  );

  const fromAccountId = String(
    formData.get("fromAccountId") ?? ""
  );

  const amountPaise = parseAmountPaise(
    String(formData.get("amount") ?? "").trim()
  );

  const transactionDate = String(
    formData.get("transactionDate") ?? ""
  ).trim();

  if (
    !validateCommonFields(description, amountPaise, transactionDate) ||
    !creditCardId ||
    !fromAccountId
  ) {
    redirect("/cards/activity?error=invalid-input");
  }

  const { supabase, userId } = await getSignedInUserId();

  const [cardResult, accountResult] = await Promise.all([
    supabase
      .from("credit_cards")
      .select("id, opening_outstanding_paise, opening_outstanding_date")
      .eq("id", creditCardId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle(),

    supabase
      .from("accounts")
      .select("id, opening_balance_date")
      .eq("id", fromAccountId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle(),
  ]);

  const card = cardResult.data;
  const account = accountResult.data;

  if (
    cardResult.error ||
    accountResult.error ||
    !card ||
    !account ||
    transactionDate < card.opening_outstanding_date ||
    transactionDate < account.opening_balance_date
  ) {
    redirect("/cards/activity?error=invalid-card-or-date");
  }

  // Calculate the card debt recorded on or before the payment date.
  const { data: existingActivity, error: activityError } =
    await supabase
      .from("transactions")
      .select("transaction_type, amount_paise")
      .eq("user_id", userId)
      .eq("credit_card_id", creditCardId)
      .in("transaction_type", ["card_purchase", "card_payment"])
      .gte("transaction_date", card.opening_outstanding_date)
      .lte("transaction_date", transactionDate);

  if (
    activityError ||
    !existingActivity ||
    amountPaise === null
  ) {
    redirect("/cards/activity?error=save-failed");
  }

  const outstandingPaise = existingActivity.reduce(
    (balance, transaction) => {
      const amount = Number(transaction.amount_paise);

      return transaction.transaction_type === "card_purchase"
        ? balance + amount
        : balance - amount;
    },
    Number(card.opening_outstanding_paise)
  );

  // For this first version, prevent payments exceeding the recorded debt.
  // We'll support overpayments and credit balances after adding reconciliation.
  if (amountPaise > Math.max(0, outstandingPaise)) {
    redirect("/cards/activity?error=payment-exceeds-outstanding");
  }

  const { error: insertError } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      transaction_date: transactionDate,
      description,
      amount_paise: amountPaise,
      transaction_type: "card_payment",
      from_account_id: account.id,
      credit_card_id: card.id,
    });

  if (insertError) {
    redirect("/cards/activity?error=save-failed");
  }

  refreshFinancialPages();
  redirect("/cards/activity?created=payment");
}
