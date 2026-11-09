"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  validateTransactionEdit,
  type TransactionEditInput,
} from "@/lib/finance/transaction-edits";
import { validateCreditCardChargeLimit } from "@/lib/finance/card-limit-engine";
import {
  executeAtomicTransferWithClient,
  isTransactionEditable,
} from "@/lib/finance/transfer-engine";

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

function revalidateAllFinancialPaths() {
  revalidatePath("/");
  revalidatePath("/transactions");
  revalidatePath("/transactions/new");
  revalidatePath("/transactions/history");
  revalidatePath("/cards");
  revalidatePath("/cards/activity");
  revalidatePath("/accounts");
  revalidatePath("/emi");
}

export async function createTransaction(formData: FormData) {
  const returnTo =
    String(formData.get("returnTo") ?? "").trim() || "/transactions/new";

  const rawDescription = String(formData.get("description") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const description = notes ? `${rawDescription} · ${notes}`.slice(0, 160) : rawDescription;

  const flowType = String(formData.get("transactionType") ?? "").trim();
  const sourceId = String(
    formData.get("sourceId") ??
      formData.get("accountId") ??
      formData.get("creditCardId") ??
      ""
  ).trim();
  const categoryName = String(formData.get("category") ?? "").trim();
  const amountInput = String(formData.get("amount") ?? "").trim();
  const transactionDate = String(
    formData.get("transactionDate") ?? ""
  ).trim();

  if (
    !description ||
    description.length > 160 ||
    !["income", "expense"].includes(flowType) ||
    !sourceId ||
    !categoryName ||
    categoryName.length > 60 ||
    !/^\d{1,12}(\.\d{1,2})?$/.test(amountInput) ||
    !isValidDate(transactionDate) ||
    transactionDate > indiaToday()
  ) {
    redirect(`${returnTo}?error=invalid-input`);
  }

  const amountRupees = Number(amountInput);
  const amountPaise = Math.round(amountRupees * 100);

  if (
    !Number.isFinite(amountRupees) ||
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    redirect(`${returnTo}?error=invalid-input`);
  }

  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  // Parse source identifier (supports "card:<id>", "account:<id>", or raw IDs)
  const isCard =
    sourceId.startsWith("card:") ||
    (Boolean(formData.get("creditCardId")) && !sourceId.startsWith("account:"));
  const cleanId = sourceId.replace(/^(card|account):/, "");

  let resolvedType: "income" | "expense" | "card_purchase";
  let targetAccountId: string | null = null;
  let targetCreditCardId: string | null = null;

  if (isCard) {
    // Credit cards cannot receive income
    if (flowType === "income") {
      redirect(`${returnTo}?error=invalid-input`);
    }

    // Verify credit card belongs to user
    const { data: card, error: cardError } = await supabase
      .from("credit_cards")
      .select("id, opening_outstanding_date, credit_limit_paise, opening_outstanding_paise")
      .eq("id", cleanId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (
      cardError ||
      !card ||
      transactionDate < card.opening_outstanding_date
    ) {
      redirect(`${returnTo}?error=invalid-card-or-date`);
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
        .select("id, linked_credit_card_id, linked_transaction_id, current_outstanding_principal_paise, status")
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
      redirect(`${returnTo}?${errParams.toString()}`);
    }

    resolvedType = "card_purchase";
    targetCreditCardId = card.id;
  } else {
    // Verify bank/cash account belongs to user
    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("id, opening_balance_date")
      .eq("id", cleanId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (
      accountError ||
      !account ||
      transactionDate < account.opening_balance_date
    ) {
      redirect(`${returnTo}?error=invalid-account-or-date`);
    }

    resolvedType = flowType as "income" | "expense";
    targetAccountId = account.id;
  }

  // Find or create category
  const categoryType = resolvedType === "income" ? "income" : "expense";
  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .upsert(
      {
        user_id: userId,
        name: categoryName,
        category_type: categoryType,
        is_archived: false,
      },
      {
        onConflict: "user_id,category_type,name",
      }
    )
    .select("id")
    .single();

  if (categoryError || !category) {
    redirect(`${returnTo}?error=save-failed`);
  }

  // Insert the unified transaction
  const { error: transactionError } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      transaction_date: transactionDate,
      description,
      amount_paise: amountPaise,
      transaction_type: resolvedType,
      account_id: targetAccountId,
      credit_card_id: targetCreditCardId,
      category_id: category.id,
    });

  if (transactionError) {
    redirect(`${returnTo}?error=save-failed`);
  }

  // Update remembered payment source preference safely
  try {
    const prefUpdate: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (flowType === "income" && targetAccountId) {
      prefUpdate.last_income_source_id = `account:${targetAccountId}`;
    } else if (flowType === "expense") {
      if (targetCreditCardId) {
        prefUpdate.last_expense_source_id = `card:${targetCreditCardId}`;
      } else if (targetAccountId) {
        prefUpdate.last_expense_source_id = `account:${targetAccountId}`;
      }
    }
    await supabase.from("user_transaction_preferences").upsert(prefUpdate, { onConflict: "user_id" });
  } catch {
    // Non-critical: Ignore if user_transaction_preferences table is not migrated yet
  }

  // Optional: Save as Favorite Template if requested by user
  const saveAsTemplate =
    formData.get("saveAsTemplate") === "true" ||
    formData.get("saveAsTemplate") === "on" ||
    formData.get("saveTemplate") === "true" ||
    formData.get("saveTemplate") === "on";

  if (saveAsTemplate) {
    const customTemplateName = String(formData.get("templateName") ?? "").trim();
    const finalTemplateName = (customTemplateName || rawDescription || "My Template").slice(0, 100);
    const fullSourceId = targetCreditCardId ? `card:${targetCreditCardId}` : `account:${targetAccountId}`;

    try {
      await supabase.from("transaction_templates").upsert(
        {
          user_id: userId,
          name: finalTemplateName,
          transaction_type: flowType,
          amount_paise: amountPaise,
          category_name: categoryName,
          category_id: category.id,
          source_id: fullSourceId,
          account_id: targetAccountId,
          credit_card_id: targetCreditCardId,
          description: rawDescription,
          memo: notes || null,
          is_favorite: formData.get("templateFavorite") === "true" || formData.get("templateFavorite") === "on",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,name" }
      );
    } catch {
      // Non-critical: Ignore if transaction_templates table is not migrated yet
    }
  }

  // Optional: Track template usage count if launched from a template
  const usedTemplateId = String(formData.get("usedTemplateId") ?? "").trim();
  if (usedTemplateId) {
    try {
      await supabase.rpc("increment_template_usage", { t_id: usedTemplateId });
    } catch {
      // Fallback simple update if RPC does not exist
      try {
        await supabase
          .from("transaction_templates")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", usedTemplateId)
          .eq("user_id", userId);
      } catch {
        // Non-critical
      }
    }
  }

  revalidateAllFinancialPaths();

  redirect(`${returnTo}?created=1`);
}

export type CreateTransferResult =
  | { success: true; redirectTo: string }
  | { success: false; error: string; code: string };

/**
 * Create an internal account-to-account transfer.
 *
 * PRODUCTION SAFETY & CONCURRENCY MODEL:
 * - Every transfer is strictly executed via the PostgreSQL RPC `record_atomic_transfer`.
 * - All non-atomic fallback insertion paths have been removed (FAIL-CLOSED POLICY).
 * - If the database RPC is missing (pending migration), the request is rejected with
 *   code "migration-required".
 * - Concurrent transfers from the same source account are serialized by the source
 *   account row-level lock (accounts FOR UPDATE) inside PostgreSQL.
 * - CONCURRENCY LIMITATION: Ordinary income, expense, and card payment creations
 *   currently do NOT acquire that lock; cross-operation balance races remain possible.
 *
 * A transfer is recorded as a single transaction row with:
 *   transaction_type = 'transfer'
 *   from_account_id  = source account
 *   to_account_id    = destination account
 *   account_id       = null
 *   credit_card_id   = null
 *   category_id      = null
 *
 * The balance engine in balances.ts already handles this shape:
 *   – from_account_id → debit (balance decreases)
 *   – to_account_id   → credit (balance increases)
 *
 * Transfers are excluded from income/expense analytics and budgets
 * by the existing budget-engine.ts and TransactionAnalysisView.tsx.
 */
export async function createTransfer(formData: FormData): Promise<CreateTransferResult> {
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/transactions/transfer";

  const description = String(formData.get("description") ?? "").trim();
  const amountInput = String(formData.get("amount") ?? "").trim();
  const transactionDate = String(formData.get("transactionDate") ?? "").trim();
  const fromAccountId = String(formData.get("fromAccountId") ?? "").trim();
  const toAccountId = String(formData.get("toAccountId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  // Basic format validation
  if (
    !description ||
    description.length > 160 ||
    !/^\d{1,12}(\.\d{1,2})?$/.test(amountInput) ||
    !isValidDate(transactionDate) ||
    transactionDate > indiaToday() ||
    !fromAccountId ||
    !toAccountId
  ) {
    return { success: false, error: "Invalid input. Check all fields.", code: "invalid-input" };
  }

  // Same-account guard
  if (fromAccountId === toAccountId) {
    return {
      success: false,
      error: "Source and destination accounts cannot be the same.",
      code: "same-transfer-accounts",
    };
  }

  const amountRupees = Number(amountInput);
  const amountPaise = Math.round(amountRupees * 100);

  if (
    !Number.isFinite(amountRupees) ||
    !Number.isSafeInteger(amountPaise) ||
    amountPaise <= 0
  ) {
    return { success: false, error: "Invalid amount.", code: "invalid-amount" };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authError || !user) {
    return { success: false, error: "Authentication required.", code: "unauthenticated" };
  }

  const userId = user.id;

  // Verify both accounts belong to the authenticated user and are not archived
  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select("id, name, account_type, opening_balance_date, opening_balance_paise")
    .eq("user_id", userId)
    .eq("is_archived", false)
    .in("id", [fromAccountId, toAccountId]);

  if (accountsError || !accounts || accounts.length < 2) {
    return {
      success: false,
      error: "One or both accounts are invalid or do not belong to your profile.",
      code: "invalid-accounts",
    };
  }

  const fromAccount = accounts.find((a) => a.id === fromAccountId);
  const toAccount = accounts.find((a) => a.id === toAccountId);

  if (!fromAccount || !toAccount) {
    return {
      success: false,
      error: "One or both accounts are invalid or do not belong to your profile.",
      code: "invalid-accounts",
    };
  }

  // Date must be on or after both accounts' opening balance dates
  if (
    transactionDate < fromAccount.opening_balance_date ||
    transactionDate < toAccount.opening_balance_date
  ) {
    return {
      success: false,
      error: "Transfer date cannot be earlier than an account's opening balance date.",
      code: "date-before-opening",
    };
  }

  // Compose description with optional notes
  const fullDescription = notes
    ? `${description} · ${notes}`.slice(0, 160)
    : description;

  // Optional transfer fee recorded as separate expense
  const feeInput = String(formData.get("feeAmount") ?? "").trim();
  let feePaise = 0;
  if (feeInput && /^\d{1,12}(\.\d{1,2})?$/.test(feeInput)) {
    const feeRupees = Number(feeInput);
    if (Number.isFinite(feeRupees) && feeRupees > 0) {
      feePaise = Math.round(feeRupees * 100);
    }
  }

  const allowOverdraft =
    formData.get("allowOverdraft") === "true" ||
    formData.get("allowOverdraft") === "on";

  // Execute transfer exclusively through PostgreSQL RPC record_atomic_transfer.
  // Fail-closed policy: No fallback inserts are permitted.
  const transferResult = await executeAtomicTransferWithClient(supabase, {
    fromAccountId,
    toAccountId,
    amountPaise,
    transactionDate,
    description: fullDescription,
    feePaise,
    allowOverdraft,
  });

  if (!transferResult.success) {
    return {
      success: false,
      error: transferResult.error,
      code: transferResult.code,
    };
  }

  revalidateAllFinancialPaths();
  return { success: true, redirectTo: `${returnTo}?created=1` };
}

export type DeleteTransactionResult =
  | { success: true }
  | { success: false; error: string; code: string };

/**
 * Delete a transaction owned by the authenticated user.
 *
 * CASCADE INTEGRITY:
 * - When deleting a transfer transaction, both the debit and credit legs are removed simultaneously.
 * - In PostgreSQL, any companion fee expense referencing this transaction via `linked_transaction_id`
 *   is automatically and atomically deleted via foreign key ON DELETE CASCADE.
 * - Ordinary income, expense, and card payment deletions remain completely unaffected.
 */
export async function deleteTransaction(
  transactionId: string
): Promise<DeleteTransactionResult> {
  if (!transactionId) {
    return { success: false, error: "Transaction ID is required.", code: "invalid-id" };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authError || !user) {
    redirect("/login");
  }

  // Protect Money Tracker ledger entries from accidental deletion in ordinary transactions
  const { data: existingTx } = await supabase
    .from("transactions")
    .select("transaction_type")
    .eq("id", transactionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    existingTx &&
    [
      "money_lent",
      "money_borrowed",
      "repayment_received",
      "repayment_paid",
    ].includes(existingTx.transaction_type)
  ) {
    return {
      success: false,
      error:
        "Money Tracker records cannot be deleted directly from the transactions ledger. Please delete the record from the Money Tracker module.",
      code: "money-tracker-deletion-disabled",
    };
  }

  const { error: deleteError } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", user.id);

  if (deleteError) {
    return { success: false, error: "Failed to delete transaction.", code: "delete-failed" };
  }

  revalidateAllFinancialPaths();
  return { success: true };
}

export type UpdateTransactionResult =
  | { success: true }
  | { success: false; error: string; code: string };

/**
 * Update an existing transaction owned by the authenticated user.
 *
 * DOCUMENTED CONCURRENCY & ISOLATION LIMITATION:
 * Transfer updates here rely on application-level balance verification.
 * They do NOT execute inside a database-level transaction lock (`accounts FOR UPDATE`).
 * Consequently, concurrent transactions mutating balances during an edit are not
 * serialized at the database level. Universal concurrency serialization would require
 * an account-locking trigger on the `transactions` table.
 */
export async function updateTransaction(
  formData: FormData
): Promise<UpdateTransactionResult> {
  const returnTo = String(formData.get("returnTo") ?? "").trim();
  const transactionId = String(formData.get("transactionId") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amountInput = String(formData.get("amount") ?? "").trim();
  const transactionDate = String(formData.get("transactionDate") ?? "").trim();
  const rawType = String(formData.get("transactionType") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "").trim() || null;
  const fromAccountId = String(formData.get("fromAccountId") ?? "").trim() || null;
  const toAccountId = String(formData.get("toAccountId") ?? "").trim() || null;
  const creditCardId = String(formData.get("creditCardId") ?? "").trim() || null;
  const categoryName = String(formData.get("category") ?? "").trim() || null;

  if (!transactionId) {
    if (returnTo) redirect(`${returnTo}?error=invalid-id`);
    return { success: false, error: "Transaction ID is required.", code: "invalid-id" };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;

  if (authError || !user) {
    redirect("/login");
  }

  const userId = user.id;

  // 1. Ownership & existence check on transaction
  const { data: existingTx, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (txError || !existingTx) {
    if (returnTo) redirect(`${returnTo}?error=transaction-not-found`);
    return {
      success: false,
      error: "Transaction not found or you do not have permission to edit it.",
      code: "transaction-not-found",
    };
  }

  // 1b. Disallow editing internal transfers to preserve double-entry ledger & fee integrity
  const editableCheck = isTransactionEditable(existingTx.transaction_type, rawType);
  if (!editableCheck.allowed) {
    if (returnTo) redirect(`${returnTo}?error=${editableCheck.code}`);
    return {
      success: false,
      error: editableCheck.error!,
      code: editableCheck.code!,
    };
  }

  // 2. Fetch authenticated user's accounts and credit cards to guarantee ownership
  const [accountsResult, cardsResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, opening_balance_date, is_archived")
      .eq("user_id", userId),
    supabase
      .from("credit_cards")
      .select("id, name, opening_outstanding_date, credit_limit_paise, opening_outstanding_paise, is_archived")
      .eq("user_id", userId),
  ]);

  if (accountsResult.error || cardsResult.error) {
    if (returnTo) redirect(`${returnTo}?error=save-failed`);
    return { success: false, error: "Could not load verification records.", code: "save-failed" };
  }

  const validTypes = [
    "income",
    "expense",
    "transfer",
    "card_purchase",
    "card_payment",
  ] as const;

  if (!validTypes.includes(rawType as (typeof validTypes)[number])) {
    if (returnTo) redirect(`${returnTo}?error=invalid-type`);
    return { success: false, error: "Invalid transaction type specified.", code: "invalid-type" };
  }

  const editInput: TransactionEditInput = {
    transactionId,
    description,
    amountInput,
    transactionDate,
    transactionType: rawType as (typeof validTypes)[number],
    accountId,
    fromAccountId,
    toAccountId,
    creditCardId,
    categoryName,
  };

  const validation = validateTransactionEdit(editInput, {
    today: indiaToday(),
    accounts: (accountsResult.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      openingBalanceDate: a.opening_balance_date,
      isArchived: a.is_archived,
    })),
    creditCards: (cardsResult.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      openingOutstandingDate: c.opening_outstanding_date,
      isArchived: c.is_archived,
    })),
  });

  if (!validation.success) {
    if (returnTo) redirect(`${returnTo}?error=${validation.code}`);
    return { success: false, error: validation.error, code: validation.code };
  }

  const payload = validation.data;

  // Enforce credit card limit invariant if transaction is a card purchase
  if (payload.transactionType === "card_purchase" && payload.creditCardId) {
    const card = cardsResult.data?.find((c) => c.id === payload.creditCardId);
    if (card) {
      const [txResult, emiResult] = await Promise.all([
        supabase
          .from("transactions")
          .select("id, transaction_date, amount_paise, transaction_type, credit_card_id")
          .eq("user_id", userId)
          .eq("credit_card_id", card.id),
        supabase
          .from("emi_debts")
          .select("id, linked_credit_card_id, linked_transaction_id, current_outstanding_principal_paise, status")
          .eq("user_id", userId)
          .eq("linked_credit_card_id", card.id)
          .eq("status", "active"),
      ]);

      const limitCheck = validateCreditCardChargeLimit({
        card,
        transactions: txResult.data ?? [],
        cardLinkedEmis: emiResult.data ?? [],
        chargeAmountPaise: payload.amountPaise,
        excludeTransactionId: transactionId,
      });

      if (!limitCheck.allowed) {
        if (returnTo) {
          const errParams = new URLSearchParams({
            error: "credit-limit-exceeded",
            limit: String(limitCheck.creditLimitPaise),
            available: String(limitCheck.currentAvailablePaise),
            exceeded: String(limitCheck.exceededByPaise),
            amount: String(payload.amountPaise),
          });
          redirect(`${returnTo}?${errParams.toString()}`);
        }
        return {
          success: false,
          error: limitCheck.errorMessage || "This transaction exceeds the card credit limit.",
          code: "credit-limit-exceeded",
        };
      }
    }
  }

  // 3. Resolve category if provided
  let categoryId: string | null = null;
  if (payload.categoryName) {
    const categoryType = payload.transactionType === "income" ? "income" : "expense";
    const { data: categoryData, error: categoryError } = await supabase
      .from("categories")
      .upsert(
        {
          user_id: userId,
          name: payload.categoryName,
          category_type: categoryType,
          is_archived: false,
        },
        {
          onConflict: "user_id,category_type,name",
        }
      )
      .select("id")
      .single();

    if (!categoryError && categoryData) {
      categoryId = categoryData.id;
    }
  } else if (payload.transactionType === existingTx.transaction_type) {
    // Preserve existing category if none was re-typed
    categoryId = existingTx.category_id;
  }

  // 4. Preserve credit card statement settlement relationships if applicable
  try {
    const { data: linkedStatements } = await supabase
      .from("credit_card_statements")
      .select("id, credit_card_id")
      .eq("settlement_transaction_id", transactionId);

    if (linkedStatements && linkedStatements.length > 0) {
      // If the card is changed or type is no longer card_payment, safely unlink to avoid corrupting statement status
      if (
        payload.transactionType !== "card_payment" ||
        payload.creditCardId !== existingTx.credit_card_id
      ) {
        await supabase
          .from("credit_card_statements")
          .update({
            settlement_transaction_id: null,
            is_settled: false,
            settled_at: null,
          })
          .eq("settlement_transaction_id", transactionId);
      }
    }
  } catch {
    // If credit_card_statements table is missing or query fails, continue safely
  }

  // 5. Update transaction record in place
  const { error: updateError } = await supabase
    .from("transactions")
    .update({
      transaction_date: payload.transactionDate,
      description: payload.description,
      amount_paise: payload.amountPaise,
      transaction_type: payload.transactionType,
      account_id: payload.accountId,
      from_account_id: payload.fromAccountId,
      to_account_id: payload.toAccountId,
      credit_card_id: payload.creditCardId,
      category_id: categoryId,
    })
    .eq("id", transactionId)
    .eq("user_id", userId);

  if (updateError) {
    if (returnTo) redirect(`${returnTo}?error=save-failed`);
    return {
      success: false,
      error: "Failed to update transaction in database. Please try again.",
      code: "save-failed",
    };
  }

  revalidateAllFinancialPaths();

  if (returnTo) {
    redirect(`${returnTo}?updated=1`);
  }

  return { success: true };
}
