"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type BudgetThresholdAlertCandidate } from "@/lib/finance/budget-engine";

/**
 * Validates and saves a category budget (create or edit).
 */
export async function saveCategoryBudget(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userId = user.id;
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/budgets";
  const budgetId = String(formData.get("budgetId") ?? "").trim() || null;
  const categoryName = String(formData.get("categoryName") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const rawMonthKey = String(formData.get("monthKey") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // Alerts checkboxes
  const alert50 = formData.get("alert50") === "on";
  const alert80 = formData.get("alert80") === "on";
  const alert100 = formData.get("alert100") === "on";

  if (!categoryName) {
    redirect(`${returnTo}?error=missing-category`);
  }

  const numericAmount = Number(rawAmount);
  if (isNaN(numericAmount) || numericAmount <= 0) {
    redirect(`${returnTo}?error=invalid-amount`);
  }

  const amountPaise = Math.round(numericAmount * 100);

  // Month key validation if provided
  let monthKey: string | null = null;
  if (rawMonthKey && /^\d{4}-(0[1-9]|1[0-2])$/.test(rawMonthKey)) {
    monthKey = rawMonthKey;
  }

  // Lookup matching category id if present in categories table
  let categoryId: string | null = null;
  const { data: existingCategory } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", categoryName)
    .limit(1)
    .maybeSingle();

  if (existingCategory?.id) {
    categoryId = existingCategory.id;
  }

  try {
    if (budgetId) {
      // Update existing budget
      const { error } = await supabase
        .from("category_budgets")
        .update({
          category_name: categoryName,
          category_id: categoryId,
          amount_paise: amountPaise,
          month_key: monthKey,
          alert_50: alert50,
          alert_80: alert80,
          alert_100: alert100,
          notes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", budgetId)
        .eq("user_id", userId);

      if (error) {
        redirect(`${returnTo}?error=save-failed`);
      }
    } else {
      // Create new budget (or upsert on conflict)
      const onConflict = monthKey
        ? "user_id,category_name,month_key"
        : "user_id,category_name";

      const { error } = await supabase
        .from("category_budgets")
        .upsert(
          {
            user_id: userId,
            category_name: categoryName,
            category_id: categoryId,
            amount_paise: amountPaise,
            month_key: monthKey,
            alert_50: alert50,
            alert_80: alert80,
            alert_100: alert100,
            is_active: true,
            notes,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict,
          }
        );

      if (error) {
        redirect(`${returnTo}?error=save-failed`);
      }
    }
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest?: unknown }).digest === "string" &&
      ((err as { digest: string }).digest.includes("NEXT_REDIRECT"))
    ) {
      throw err;
    }
    redirect(`${returnTo}?error=save-failed`);
  }

  revalidatePath("/budgets");
  revalidatePath("/");
  redirect(`${returnTo}?saved=1`);
}

/**
 * Toggles active state of a budget (pause/resume).
 */
export async function toggleCategoryBudgetActive(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userId = user.id;
  const budgetId = String(formData.get("budgetId") ?? "").trim();
  const currentActive = formData.get("isActive") === "true";
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/budgets";

  if (!budgetId) {
    redirect(returnTo);
  }

  await supabase
    .from("category_budgets")
    .update({
      is_active: !currentActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", budgetId)
    .eq("user_id", userId);

  revalidatePath("/budgets");
  revalidatePath("/");
  redirect(`${returnTo}?updated=1`);
}

/**
 * Deletes or archives a category budget.
 */
export async function deleteCategoryBudget(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userId = user.id;
  const budgetId = String(formData.get("budgetId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/budgets";

  if (!budgetId) {
    redirect(returnTo);
  }

  await supabase
    .from("category_budgets")
    .delete()
    .eq("id", budgetId)
    .eq("user_id", userId);

  revalidatePath("/budgets");
  revalidatePath("/");
  redirect(`${returnTo}?deleted=1`);
}

/**
 * Acknowledges a triggered budget alert event.
 */
export async function acknowledgeBudgetAlert(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const userId = user.id;
  const alertId = String(formData.get("alertId") ?? "").trim();
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/budgets";

  if (!alertId) {
    redirect(returnTo);
  }

  await supabase
    .from("budget_alert_events")
    .update({
      is_acknowledged: true,
      acknowledged_at: new Date().toISOString(),
    })
    .eq("id", alertId)
    .eq("user_id", userId);

  revalidatePath("/budgets");
  revalidatePath("/");
  redirect(returnTo);
}

/**
 * Inserts newly triggered threshold alerts idempotently.
 */
export async function syncBudgetAlerts(
  userId: string,
  candidates: BudgetThresholdAlertCandidate[]
): Promise<void> {
  if (!candidates.length) return;

  const supabase = await createClient();

  for (const c of candidates) {
    try {
      await supabase
        .from("budget_alert_events")
        .upsert(
          {
            user_id: userId,
            budget_id: c.budgetId,
            category_name: c.categoryName,
            month_key: c.monthKey,
            threshold_percent: c.thresholdPercent,
            spending_paise: c.spendingPaise,
            budget_paise: c.budgetPaise,
            triggered_at: new Date().toISOString(),
            is_acknowledged: false,
          },
          {
            onConflict: "user_id,category_name,month_key,threshold_percent",
          }
        );
    } catch {
      // Ignore if table missing or conflict
    }
  }
}
