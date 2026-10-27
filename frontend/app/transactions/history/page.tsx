import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../../login/actions";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { MonthwiseLedgerView, LedgerTransaction } from "./MonthwiseLedgerView";
import { ArrowLeft, Plus } from "lucide-react";

type AccountRow = {
  id: string;
  name: string;
};

type CategoryRow = {
  id: string;
  name: string;
};

async function MonthwiseLedgerContent() {
  await connection();

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

  // Fetch all transactions, accounts, and categories
  const [accountsResult, transactionsResult, categoriesResult] =
    await Promise.all([
      supabase
        .from("accounts")
        .select("id, name")
        .eq("user_id", userId),

      supabase
        .from("transactions")
        .select(
          "id, transaction_date, description, amount_paise, transaction_type, account_id, from_account_id, category_id"
        )
        .eq("user_id", userId)
        .order("transaction_date", { ascending: false })
        .order("id", { ascending: false }),

      supabase
        .from("categories")
        .select("id, name")
        .eq("user_id", userId),
    ]);

  const accounts = (accountsResult.data ?? []) as unknown as AccountRow[];
  const categories = (categoriesResult.data ?? []) as unknown as CategoryRow[];
  const transactions = (transactionsResult.data ?? []) as unknown as LedgerTransaction[];

  const accountMap: Record<string, string> = {};
  for (const acc of accounts) {
    accountMap[acc.id] = acc.name;
  }

  const categoryMap: Record<string, string> = {};
  for (const cat of categories) {
    categoryMap[cat.id] = cat.name;
  }

  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3]">
      {/* Obsidian Wealth ambient light orbs */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-[#10b981]/10 blur-[150px] animate-pulse-glow" />
      <div
        className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/10 blur-[160px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />

      {/* Stitch Executive Header */}
      <AuraHeader
        sectionTitle="Monthwise Ledger"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 space-y-6">
        {/* Navigation context pill */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Transactions</span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#4edea3]">
              {transactions.length} TOTAL TRANSACTIONS
            </span>
            <Link
              href="/transactions/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-1.5 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all"
            >
              <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>Add Transaction</span>
            </Link>
          </div>
        </div>

        {/* The Monthwise Ledger View */}
        <MonthwiseLedgerView
          transactions={transactions}
          accountMap={accountMap}
          categoryMap={categoryMap}
          userEmail={userEmail}
        />

        {/* Footer */}
        <p className="pt-6 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Private financial telemetry. Calculations computed idempotently from verified database records.
        </p>
      </div>

      {/* Stitch Floating Dock */}
      <AuraBottomNav />
    </main>
  );
}

export default function MonthwiseHistoryPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#10141a] p-6 text-slate-400">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4edea3] border-t-transparent" />
            <p className="text-sm font-mono tracking-wider text-slate-300">
              Loading monthwise ledger...
            </p>
          </div>
        </main>
      }
    >
      <MonthwiseLedgerContent />
    </Suspense>
  );
}
