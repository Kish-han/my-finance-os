"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  calculateDueDateFromStatementDate,
  allocatePaymentsToStatements,
} from "@/lib/finance/statement-engine";
import { calculateAccountBalance } from "@/lib/finance/balances";
import type { FinancialAccount, Transaction } from "@/lib/finance/types";

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function parseRupees(value: string): number | null {
  if (!value) return null;
  const clean = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;

  const rupees = Number(clean);
  const paise = Math.round(rupees * 100);

  if (!Number.isFinite(rupees) || !Number.isSafeInteger(paise) || paise < 0) {
    return null;
  }

  return paise;
}

async function getSignedInUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

function refreshAllPages() {
  revalidatePath("/");
  revalidatePath("/cards");
  revalidatePath("/cards/activity");
  revalidatePath("/transactions");
  revalidatePath("/accounts");
  revalidatePath("/emi");
}

/**
 * Creates or updates a credit card statement for a billing cycle.
 */
export async function saveCardStatement(formData: FormData) {
  const creditCardId = String(formData.get("credit_card_id") ?? "").trim();
  const statementDate = String(formData.get("statement_date") ?? "").trim();
  const paymentDueDateInput = String(formData.get("payment_due_date") ?? "").trim();
  const balanceInput = String(formData.get("statement_balance_rupees") ?? "").trim();
  const minDueInput = String(formData.get("minimum_due_rupees") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!creditCardId) {
    redirect("/?error=" + encodeURIComponent("Select a credit card."));
  }

  if (!isValidDate(statementDate)) {
    redirect("/?error=" + encodeURIComponent("Enter a valid statement date."));
  }

  const statementBalancePaise = parseRupees(balanceInput);
  if (statementBalancePaise === null || statementBalancePaise < 0) {
    redirect("/?error=" + encodeURIComponent("Enter a valid statement balance amount."));
  }

  const { supabase, user } = await getSignedInUser();

  // Verify card ownership and get payment due day
  const { data: card, error: cardError } = await supabase
    .from("credit_cards")
    .select("id, name, payment_due_day, statement_day")
    .eq("id", creditCardId)
    .eq("user_id", user.id)
    .eq("is_archived", false)
    .maybeSingle();

  if (cardError || !card) {
    redirect("/?error=" + encodeURIComponent("Credit card not found."));
  }

  let finalDueDate = paymentDueDateInput;
  if (!isValidDate(finalDueDate)) {
    // If not provided or invalid, compute from card's paymentDueDay
    finalDueDate = calculateDueDateFromStatementDate(
      statementDate,
      card.payment_due_day ?? 5
    );
  } else if (finalDueDate < statementDate) {
    // If due date was set earlier than statement date (e.g. month rollover mismatch),
    // check if it matches the card's payment_due_day and roll it to the appropriate month
    if (card.payment_due_day) {
      finalDueDate = calculateDueDateFromStatementDate(statementDate, card.payment_due_day);
    }
    if (finalDueDate < statementDate) {
      redirect("/?error=" + encodeURIComponent("Payment due date must be on or after statement date."));
    }
  }

  let minimumDuePaise: number | null = minDueInput ? parseRupees(minDueInput) : null;
  if (minDueInput && minimumDuePaise === null) {
    redirect("/?error=" + encodeURIComponent("Enter a valid minimum due amount."));
  }

  // If minimum due was not entered, default to standard 5% or ₹500
  if (minimumDuePaise === null && statementBalancePaise > 0) {
    minimumDuePaise = Math.min(statementBalancePaise, Math.max(50_000, Math.round(statementBalancePaise * 0.05)));
  }

  if (minimumDuePaise !== null && minimumDuePaise > statementBalancePaise) {
    redirect("/?error=" + encodeURIComponent("Minimum due cannot exceed total statement balance."));
  }

  // Upsert statement: update if one already exists for this card & cutoff date, otherwise insert
  const { data: existingStmt } = await supabase
    .from("credit_card_statements")
    .select("id")
    .eq("user_id", user.id)
    .eq("credit_card_id", creditCardId)
    .eq("statement_date", statementDate)
    .maybeSingle();

  let saveError;
  if (existingStmt) {
    const { error } = await supabase
      .from("credit_card_statements")
      .update({
        payment_due_date: finalDueDate,
        statement_balance_paise: statementBalancePaise,
        minimum_due_paise: minimumDuePaise,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingStmt.id);
    saveError = error;
  } else {
    const { error } = await supabase
      .from("credit_card_statements")
      .insert({
        user_id: user.id,
        credit_card_id: creditCardId,
        statement_date: statementDate,
        payment_due_date: finalDueDate,
        statement_balance_paise: statementBalancePaise,
        minimum_due_paise: minimumDuePaise,
        is_settled: false,
        notes,
      });
    saveError = error;
  }

  if (saveError) {
    if (
      saveError.code === "42P01" ||
      saveError.code === "PGRST205" ||
      saveError.message.includes("does not exist") ||
      saveError.message.includes("schema cache")
    ) {
      redirect(
        "/?error=" +
          encodeURIComponent(
            "The credit_card_statements table has not been initialized in Supabase yet. Please run migration 20261027150000_create_credit_card_statements.sql in your Supabase SQL editor."
          )
      );
    }
    redirect("/?error=" + encodeURIComponent(saveError.message || "Failed to save statement."));
  }

  refreshAllPages();
  redirect("/?statement_saved=1");
}

/**
 * Records a payment against a credit card statement using the existing authorized
 * card_payment flow, updating bank balance, card outstanding, and statement status.
 * Accepts payments on ANY date (before cutoff, on cutoff, after cutoff, on due date, after due date).
 */
export async function recordStatementPayment(formData: FormData) {
  const creditCardId = String(formData.get("credit_card_id") ?? "").trim();
  const fromAccountId = String(formData.get("from_account_id") ?? "").trim();
  const amountInput = String(formData.get("amount_rupees") ?? "").trim();
  const paymentDate = String(formData.get("payment_date") ?? "").trim();
  const descriptionInput = String(formData.get("description") ?? "").trim();

  if (!creditCardId || !fromAccountId) {
    redirect("/?error=" + encodeURIComponent("Select paying account and credit card."));
  }

  if (!isValidDate(paymentDate)) {
    redirect("/?error=" + encodeURIComponent("Enter a valid payment date."));
  }

  const amountPaise = parseRupees(amountInput);
  if (amountPaise === null || amountPaise <= 0) {
    redirect("/?error=" + encodeURIComponent("Enter a payment amount greater than ₹0."));
  }

  const { supabase, user } = await getSignedInUser();

  // Verify card and account ownership
  const [cardResult, accountResult] = await Promise.all([
    supabase
      .from("credit_cards")
      .select("id, name, opening_outstanding_date")
      .eq("id", creditCardId)
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .maybeSingle(),

    supabase
      .from("accounts")
      .select("id, name, type, opening_balance_paise, opening_balance_date")
      .eq("id", fromAccountId)
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .maybeSingle(),
  ]);

  if (cardResult.error || !cardResult.data || accountResult.error || !accountResult.data) {
    redirect("/?error=" + encodeURIComponent("Invalid card or bank account."));
  }

  const card = cardResult.data;
  const account = accountResult.data;

  if (
    paymentDate < card.opening_outstanding_date ||
    paymentDate < account.opening_balance_date
  ) {
    redirect("/?error=" + encodeURIComponent("Payment date cannot precede opening balance date."));
  }

  // Check account balance for sufficient funds
  const { data: accountTxRows } = await supabase
    .from("transactions")
    .select("id, transaction_date, amount_paise, transaction_type, account_id, from_account_id, to_account_id")
    .eq("user_id", user.id)
    .or(`account_id.eq.${fromAccountId},from_account_id.eq.${fromAccountId},to_account_id.eq.${fromAccountId}`);

  const mappedAccount: FinancialAccount = {
    id: account.id,
    name: account.name,
    type: account.type === "cash" ? "cash" : "bank",
    openingBalancePaise: Number(account.opening_balance_paise || 0),
    openingBalanceDate: account.opening_balance_date,
    isArchived: false,
  };

  const mappedTx: Transaction[] = (accountTxRows || []).map((t) => ({
    id: t.id,
    date: t.transaction_date,
    description: "",
    amountPaise: Number(t.amount_paise),
    type: t.transaction_type,
    accountId: t.account_id,
    fromAccountId: t.from_account_id,
    toAccountId: t.to_account_id,
    categoryId: "",
  }));

  const currentAccountBalance = calculateAccountBalance(mappedAccount, mappedTx);
  if (amountPaise > currentAccountBalance) {
    redirect(
      "/?error=" +
        encodeURIComponent(
          `Insufficient funds in ${account.name}. Available balance: ₹${(
            currentAccountBalance / 100
          ).toFixed(2)}`
        )
    );
  }

  const description =
    descriptionInput || `Credit card repayment - ${card.name}`;

  // 1. Insert authorized card_payment transaction
  const { data: newTx, error: txError } = await supabase
    .from("transactions")
    .insert({
      user_id: user.id,
      transaction_date: paymentDate,
      description,
      amount_paise: amountPaise,
      transaction_type: "card_payment",
      from_account_id: account.id,
      credit_card_id: card.id,
    })
    .select("id")
    .single();

  if (txError) {
    redirect("/?error=" + encodeURIComponent(txError.message || "Failed to record payment."));
  }

  // 2. Allocate across all statements for this card (oldest due date first)
  try {
    const { data: statementsData } = await supabase
      .from("credit_card_statements")
      .select("id, statement_date, payment_due_date, statement_balance_paise, is_settled")
      .eq("user_id", user.id)
      .eq("credit_card_id", creditCardId)
      .order("payment_due_date", { ascending: true });

    if (statementsData && statementsData.length > 0) {
      // Fetch all card payments for this card
      const { data: allCardPayments } = await supabase
        .from("transactions")
        .select("amount_paise, transaction_date")
        .eq("user_id", user.id)
        .eq("credit_card_id", creditCardId)
        .eq("transaction_type", "card_payment");

      const paymentList = (allCardPayments || []).map((p) => ({
        amountPaise: Number(p.amount_paise),
        date: p.transaction_date,
      }));

      const stmtList = statementsData.map((s) => ({
        id: s.id,
        statementDate: s.statement_date,
        paymentDueDate: s.payment_due_date,
        statementBalancePaise: Number(s.statement_balance_paise),
        isSettled: false,
      }));

      const allocations = allocatePaymentsToStatements(stmtList, paymentList);

      for (const alloc of allocations) {
        if (alloc.isFullyPaid) {
          await supabase
            .from("credit_card_statements")
            .update({
              is_settled: true,
              settled_at: new Date().toISOString(),
              settlement_transaction_id: newTx?.id ?? null,
            })
            .eq("id", alloc.statementId);
        } else {
          await supabase
            .from("credit_card_statements")
            .update({
              is_settled: false,
              settled_at: null,
            })
            .eq("id", alloc.statementId);
        }
      }
    }
  } catch {
    // If credit_card_statements table does not exist or fails, silent fallback
  }

  refreshAllPages();
  redirect("/?payment_recorded=1");
}
