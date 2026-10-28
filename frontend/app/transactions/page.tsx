import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { getIndiaToday, type TransactionRecord } from "@/lib/finance/date-ranges";
import {
  TransactionAnalysisView,
  type AccountOption,
  type CreditCardOption,
  type CategoryOption,
} from "./TransactionAnalysisView";
import TransactionsLoading from "./loading";

type TransactionsPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    updated?: string;
    type?: string;
  }>;
};

async function TransactionsContent({
  searchParams,
}: TransactionsPageProps) {
  await connection();

  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const userId = user.id;
  const userEmail = user.email || "Private Client";
  const displayName = resolveDisplayName(user);

  // Fetch accounts, credit cards, transactions, and categories in parallel
  const [
    accountsResult,
    cardsResult,
    transactionsResult,
    categoriesResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, account_type, institution, opening_balance_date")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("credit_cards")
      .select("id, name, bank_name, last_four_digits, opening_outstanding_date")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("transactions")
      .select(
        "id, transaction_date, description, amount_paise, transaction_type, account_id, from_account_id, to_account_id, credit_card_id, category_id"
      )
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false })
      .order("id", { ascending: false }),

    supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_archived", false),
  ]);

  const accounts = (accountsResult.data ?? []) as unknown as AccountOption[];
  const creditCards = (cardsResult.data ?? []) as unknown as CreditCardOption[];
  const transactions = (transactionsResult.data ?? []) as unknown as TransactionRecord[];
  const categories = (categoriesResult.data ?? []) as unknown as CategoryOption[];

  const defaultCategories = [
    "Food & Dining",
    "Groceries",
    "Shopping & Lifestyle",
    "Utilities & Bills",
    "Housing & Rent",
    "Transportation & Fuel",
    "Entertainment",
    "Healthcare & Medical",
    "Travel & Transit",
    "Personal Care",
    "Investments & Savings",
    "Salary",
    "Freelance & Consulting",
    "Gifts & Donations",
    "Loan / EMI Payment",
    "Other",
  ];

  const availableCategories = Array.from(
    new Set([
      ...categories.map((c) => c.name),
      ...defaultCategories,
    ])
  );

  const errorMessages: Record<string, string> = {
    "invalid-input":
      "Check the amount, date, description and category. Amounts must be positive, and future dates aren't allowed.",
    "invalid-account-or-date":
      "Select one of your active accounts and a date on or after its opening-balance date.",
    "save-failed":
      "We couldn't save the transaction. Please try again.",
  };

  const today = getIndiaToday();

  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3]">
      {/* Obsidian Wealth ambient atmospheric lighting */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-[#10b981]/10 blur-[150px] animate-pulse-glow" />
      <div
        className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/10 blur-[160px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-cyan-500/10 blur-[130px] animate-pulse-glow"
        style={{ animationDelay: "4s" }}
      />

      {/* Stitch Executive Header */}
      <AuraHeader
        sectionTitle="Transfers & Ledger"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
        <TransactionAnalysisView
          transactions={transactions}
          accounts={accounts}
          creditCards={creditCards}
          categories={categories}
          availableCategories={availableCategories}
          today={today}
          createdSuccess={params.created === "1"}
          updatedSuccess={params.updated === "1"}
          errorCode={params.error}
          errorMessages={errorMessages}
        />

        {/* Footer */}
        <p className="pt-10 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Private financial telemetry. Calculations computed idempotently from verified database records.
        </p>
      </div>

      {/* Stitch Floating Dock */}
      <AuraBottomNav />
    </main>
  );
}

export default function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  return (
    <Suspense fallback={<TransactionsLoading />}>
      <TransactionsContent searchParams={searchParams} />
    </Suspense>
  );
}
