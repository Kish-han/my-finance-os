"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type TemplateActionResult = {
  success: boolean;
  error?: string;
  templateId?: string;
};

/**
 * Creates or updates a user transaction template.
 */
export async function saveTransactionTemplate(
  formData: FormData
): Promise<TemplateActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const userId = user.id;
  const templateId = String(formData.get("templateId") ?? "").trim() || null;
  const name = String(formData.get("name") ?? "").trim();
  const flowType = String(formData.get("transactionType") ?? "").trim();
  const rawAmount = String(formData.get("amount") ?? "").trim();
  const categoryName = String(formData.get("categoryName") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const memo = String(formData.get("memo") ?? "").trim() || null;
  const isFavorite = formData.get("isFavorite") === "true" || formData.get("isFavorite") === "on";

  if (!name || name.length > 100) {
    return { success: false, error: "Template name is required (max 100 characters)." };
  }

  if (flowType !== "income" && flowType !== "expense") {
    return { success: false, error: "Invalid transaction type." };
  }

  const numericAmount = Number(rawAmount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { success: false, error: "Valid positive amount is required." };
  }
  const amountPaise = Math.round(numericAmount * 100);

  if (!categoryName) {
    return { success: false, error: "Category name is required." };
  }

  if (!sourceId) {
    return { success: false, error: "Payment source is required." };
  }

  // Financial Invariant: Income can NEVER be associated with a credit card
  if (flowType === "income" && sourceId.startsWith("card:")) {
    return { success: false, error: "Income cannot be deposited into a credit card." };
  }

  const isCard = sourceId.startsWith("card:");
  const cleanId = sourceId.replace(/^(card|account):/, "");
  const accountId = isCard ? null : cleanId;
  const creditCardId = isCard ? cleanId : null;

  // Find category ID if exists
  let categoryId: string | null = null;
  const { data: catRow } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", categoryName)
    .limit(1)
    .maybeSingle();

  if (catRow?.id) {
    categoryId = catRow.id;
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    name,
    transaction_type: flowType,
    amount_paise: amountPaise,
    category_name: categoryName,
    category_id: categoryId,
    source_id: sourceId,
    account_id: accountId,
    credit_card_id: creditCardId,
    description: description || name,
    memo,
    is_favorite: isFavorite,
    updated_at: new Date().toISOString(),
  };

  try {
    if (templateId) {
      const { data, error } = await supabase
        .from("transaction_templates")
        .update(payload)
        .eq("id", templateId)
        .eq("user_id", userId)
        .select("id")
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      revalidatePath("/transactions/new");
      return { success: true, templateId: data?.id };
    } else {
      const { data, error } = await supabase
        .from("transaction_templates")
        .insert(payload)
        .select("id")
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      revalidatePath("/transactions/new");
      return { success: true, templateId: data?.id };
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to save template.",
    };
  }
}

/**
 * Deletes a user transaction template.
 */
export async function deleteTransactionTemplate(
  templateId: string
): Promise<TemplateActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const { error } = await supabase
      .from("transaction_templates")
      .delete()
      .eq("id", templateId)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/transactions/new");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to delete template.",
    };
  }
}

/**
 * Toggles a template's favorite status.
 */
export async function toggleFavoriteTemplate(
  templateId: string,
  isFavorite: boolean
): Promise<TemplateActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const { error } = await supabase
      .from("transaction_templates")
      .update({
        is_favorite: isFavorite,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateId)
      .eq("user_id", user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath("/transactions/new");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to update favorite status.",
    };
  }
}

/**
 * Pins or unpins a category for fast access.
 */
export async function togglePinCategory(
  categoryName: string,
  isPinned: boolean
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Unauthorized" };
  }

  const userId = user.id;

  try {
    const { data: prefRow } = await supabase
      .from("user_transaction_preferences")
      .select("pinned_category_names")
      .eq("user_id", userId)
      .maybeSingle();

    const currentPinned = new Set<string>(
      (prefRow?.pinned_category_names ?? []).map((n: string) => n.trim().toLowerCase())
    );

    const targetKey = categoryName.trim().toLowerCase();
    if (isPinned) {
      currentPinned.add(targetKey);
    } else {
      currentPinned.delete(targetKey);
    }

    const updatedPinnedNames = Array.from(currentPinned);

    await supabase.from("user_transaction_preferences").upsert(
      {
        user_id: userId,
        pinned_category_names: updatedPinnedNames,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    revalidatePath("/transactions/new");
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to pin category.",
    };
  }
}
