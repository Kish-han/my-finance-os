
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

export async function createAccount(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const accountType = formData.get("accountType");
  const institution = String(formData.get("institution") ?? "").trim();
  const balanceInput = String(
    formData.get("openingBalance") ?? ""
  ).trim();
  const openingBalanceDate = String(
    formData.get("openingBalanceDate") ?? ""
  ).trim();

  if (
    name.length < 1 ||
    name.length > 80 ||
    (accountType !== "bank" && accountType !== "cash") ||
    !/^\d+(\.\d{1,2})?$/.test(balanceInput) ||
    !isValidDate(openingBalanceDate)
  ) {
    redirect("/accounts?error=invalid-input");
  }

  const balanceRupees = Number(balanceInput);
  const balancePaise = Math.round(balanceRupees * 100);

  if (
    !Number.isFinite(balanceRupees) ||
    !Number.isSafeInteger(balancePaise) ||
    balancePaise < 0
  ) {
    redirect("/accounts?error=invalid-input");
  }

  const supabase = await createClient();

  // Verify the signed-in user before inserting any record.
  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const { error } = await supabase.from("accounts").insert({
    user_id: userId,
    name,
    account_type: accountType,
    institution: institution || null,
    opening_balance_paise: balancePaise,
    opening_balance_date: openingBalanceDate,
    currency_code: "INR",
  });

  if (error) {
    redirect("/accounts?error=save-failed");
  }

  revalidatePath("/accounts");
  redirect("/accounts?created=1");
}
