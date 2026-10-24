
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

export async function createTransaction(formData: FormData) {
  const description = String(
    formData.get("description") ?? ""
  ).trim();

  const transactionType = formData.get("transactionType");
  const accountId = String(formData.get("accountId") ?? "");
  const categoryName = String(formData.get("category") ?? "").trim();
  const amountInput = String(formData.get("amount") ?? "").trim();
  const transactionDate = String(
    formData.get("transactionDate") ?? ""
  ).trim();

  if (
    !description ||
    description.length > 160 ||
    !["income", "expense"].includes(String(transactionType)) ||
    !accountId ||
    !categoryName ||
    categoryName.length > 60 ||
    !/^\d{1,12}(\.\d{1,2})?$/.test(amountInput) ||
    !isValidDate(transactionDate) ||
    transactionDate > indiaToday()
  ) {
    redirect("/transactions?error=invalid-input");
  }

  const amountRupees = Number(amountInput);
  const amountPaise = Math.round(amountRupees * 100);

  if (
    !Number.isFinite(amountRupees) ||
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    redirect("/transactions?error=invalid-input");
  }

  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  // Verify that the selected account belongs to this user.
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id, opening_balance_date")
    .eq("id", accountId)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .maybeSingle();

  if (
    accountError ||
    !account ||
    transactionDate < account.opening_balance_date
  ) {
    redirect("/transactions?error=invalid-account-or-date");
  }

  // Find or create a category belonging to this user and transaction type.
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .upsert(
      {
        user_id: userId,
        name: categoryName,
        category_type: transactionType,
        is_archived: false,
      },
      {
        onConflict: "user_id,category_type,name",
      }
    )
    .select("id")
    .single();

  if (categoryError || !category) {
    redirect("/transactions?error=save-failed");
  }

  // Only income and expense transactions are supported in this first form.
  const { error: transactionError } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      transaction_date: transactionDate,
      description,
      amount_paise: amountPaise,
      transaction_type: transactionType,
      account_id: account.id,
      category_id: category.id,
    });

  if (transactionError) {
    redirect("/transactions?error=save-failed");
  }

  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/accounts");

  redirect("/transactions?created=1");
}
