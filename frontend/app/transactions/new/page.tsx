import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Zap, Plus, ArrowDownLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../../login/actions";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { getIndiaToday } from "@/lib/finance/date-ranges";
import TransactionForm from "../TransactionForm";

type NewTransactionPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    type?: string;
  }>;
};

type AccountRow = {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
  opening_balance_date: string;
};

type CategoryRow = {
  id: string;
  name: string;
};

async function NewTransactionContent({
  searchParams,
}: NewTransactionPageProps) {
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

  // Fetch accounts and categories
  const [accountsResult, categoriesResult] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, account_type, institution, opening_balance_date")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_archived", false),
  ]);

  const accounts = (accountsResult.data ?? []) as unknown as AccountRow[];
  const categories = (categoriesResult.data ?? []) as unknown as CategoryRow[];

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

  const earliestDate =
    accounts.length > 0
      ? accounts.reduce(
          (earliest, account) =>
            account.opening_balance_date < earliest
              ? account.opening_balance_date
              : earliest,
          accounts[0].opening_balance_date
        )
      : undefined;

  const today = getIndiaToday();
  const initialType = params.type === "income" ? "income" : "expense";

  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3]">
      {/* Obsidian Wealth ambient atmospheric lights */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-[#10b981]/10 blur-[150px] animate-pulse-glow" />
      <div
        className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/10 blur-[160px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-cyan-500/10 blur-[130px] animate-pulse-glow"
        style={{ animationDelay: "4s" }}
      />

      {/* Header */}
      <AuraHeader
        sectionTitle="Record Transaction"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-2xl px-4 sm:px-6 space-y-6">
        {/* Navigation Breadcrumb Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/transactions"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors group cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Transactions</span>
          </Link>

          <span className="text-[10px] font-mono uppercase tracking-widest text-[#4edea3]">
            FINANCIAL TELEMETRY · ENTRY
          </span>
        </div>

        {/* Page Title Header */}
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-[#4edea3] animate-pulse" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[#4edea3]">
              AUDITED DOUBLE-ENTRY LEDGER
            </span>
          </div>
          <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-white">
            Record Financial Activity
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Post verified deposits, income credits, or expenses directly across your liquid accounts
          </p>
        </div>

        {/* Success Confirmation State */}
        {params.created === "1" && (
          <div
            role="status"
            className="rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-5 backdrop-blur-xl shadow-xl space-y-3 animate-in fade-in duration-300"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-[#4edea3] ring-1 ring-emerald-500/30">
                <Zap className="h-5 w-5 shrink-0" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">
                  Transaction Recorded Successfully
                </h3>
                <p className="text-xs text-emerald-300/80">
                  Your liquid balances and cashflow telemetry have been updated.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/transactions"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:brightness-110 active:scale-95 transition-all"
              >
                <span>View in Transaction History →</span>
              </Link>
              <Link
                href="/transactions/new"
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-3.5 py-2 text-xs font-bold text-white active:scale-95 transition-all"
              >
                <Plus className="h-3.5 w-3.5 text-[#4edea3]" />
                <span>Record Another</span>
              </Link>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {params.error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300 backdrop-blur-xl animate-in fade-in duration-200"
          >
            {errorMessages[params.error] ?? "Something went wrong saving the transaction."}
          </div>
        )}

        {/* Account Requirement Warning */}
        {accounts.length === 0 ? (
          <div className="aura-panel p-8 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <ArrowDownLeft className="h-7 w-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">No active accounts detected</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                Add a bank account or cash wallet first to establish an opening balance before recording transactions.
              </p>
            </div>
            <Link
              href="/accounts"
              className="inline-flex items-center gap-2 rounded-xl bg-[#4edea3] px-5 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 transition-all"
            >
              <span>Add an Account Now →</span>
            </Link>
          </div>
        ) : (
          /* Transaction Entry Card */
          <section className="aura-panel p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-[#4edea3] animate-pulse" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Transaction Entry Parameters
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] border-white/10 text-slate-400">
                INR · LIQUID LEDGER
              </Badge>
            </div>

            <TransactionForm
              accounts={accounts}
              availableCategories={availableCategories}
              earliestDate={earliestDate}
              initialType={initialType}
              today={today}
              returnTo="/transactions/new"
            />
          </section>
        )}

        {/* Footer */}
        <p className="pt-6 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Private financial telemetry. Calculations computed idempotently from verified database records.
        </p>
      </div>

      {/* Floating Bottom Nav */}
      <AuraBottomNav />
    </main>
  );
}

export default function NewTransactionPage({
  searchParams,
}: NewTransactionPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#10141a] p-6 text-slate-400">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4edea3] border-t-transparent" />
            <p className="text-sm font-mono tracking-wider text-slate-300">
              Loading transaction entry...
            </p>
          </div>
        </main>
      }
    >
      <NewTransactionContent searchParams={searchParams} />
    </Suspense>
  );
}
