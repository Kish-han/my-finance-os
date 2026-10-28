import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../login/actions";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import {
  type CategoryBudget,
  type BudgetAlertEvent,
  calculateMonthlyBudgets,
  evaluateBudgetThresholdAlerts,
  normalizeMonthKey,
} from "@/lib/finance/budget-engine";
import { type TransactionRecord } from "@/lib/finance/date-ranges";
import { BudgetsView } from "./BudgetsView";
import { syncBudgetAlerts } from "./actions";

type BudgetsPageProps = {
  searchParams: Promise<{
    month?: string;
    saved?: string;
    updated?: string;
    deleted?: string;
    error?: string;
  }>;
};

async function BudgetsContent({ searchParams }: BudgetsPageProps) {
  await connection();

  const params = await searchParams;
  const targetMonth = normalizeMonthKey(params.month);
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

  let tableMissing = false;

  // Execute queries in parallel
  const [budgetsRes, txRes, categoriesRes, alertsRes] = await Promise.all([
    supabase
      .from("category_budgets")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),

    supabase
      .from("transactions")
      .select("id, transaction_date, description, amount_paise, transaction_type, category_id, credit_card_id")
      .eq("user_id", userId)
      .order("transaction_date", { ascending: false }),

    supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_archived", false),

    supabase
      .from("budget_alert_events")
      .select("*")
      .eq("user_id", userId)
      .order("triggered_at", { ascending: false }),
  ]);

  if (budgetsRes.error || alertsRes.error) {
    const isMissing =
      budgetsRes.error?.message?.includes("category_budgets") ||
      alertsRes.error?.message?.includes("budget_alert_events") ||
      (budgetsRes.error as { code?: string } | null)?.code === "42P01" ||
      (alertsRes.error as { code?: string } | null)?.code === "42P01";

    if (isMissing) {
      tableMissing = true;
    }
  }

  const allBudgets = (budgetsRes.data ?? []) as unknown as CategoryBudget[];
  const transactions = (txRes.data ?? []) as unknown as TransactionRecord[];
  const categoriesList = (categoriesRes.data ?? []) as unknown as { id: string; name: string }[];
  let alertEvents = (alertsRes.data ?? []) as unknown as BudgetAlertEvent[];

  // Build category ID to Name map
  const categoryMap = new Map<string, string>();
  for (const cat of categoriesList) {
    categoryMap.set(cat.id, cat.name);
  }

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
    "Subscriptions",
    "Investments & Savings",
    "Loan / EMI Payment",
    "Other",
  ];

  const availableCategories = Array.from(
    new Set([...categoriesList.map((c) => c.name), ...defaultCategories])
  );

  // Compute monthly overview & spending
  const overview = calculateMonthlyBudgets(allBudgets, transactions, categoryMap, targetMonth);

  // Evaluate and sync threshold alerts idempotently
  if (!tableMissing && allBudgets.length > 0) {
    const candidates = evaluateBudgetThresholdAlerts(
      overview.categorySummaries,
      alertEvents,
      targetMonth
    );

    if (candidates.length > 0) {
      await syncBudgetAlerts(userId, candidates);
      // Refresh alertEvents query so new alerts render immediately
      const refreshedAlerts = await supabase
        .from("budget_alert_events")
        .select("*")
        .eq("user_id", userId)
        .order("triggered_at", { ascending: false });

      if (refreshedAlerts.data) {
        alertEvents = refreshedAlerts.data as unknown as BudgetAlertEvent[];
      }
    }
  }

  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3]">
      {/* Ambient background glows */}
      <div
        className="pointer-events-none fixed top-0 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[140px] animate-pulse-glow"
        style={{ animationDelay: "1s" }}
      />
      <div
        className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-teal-500/10 blur-[130px] animate-pulse-glow"
        style={{ animationDelay: "3s" }}
      />

      <AuraHeader
        sectionTitle="Budgets & Spending Limits"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        <BudgetsView
          overview={overview}
          allBudgets={allBudgets}
          alertEvents={alertEvents}
          availableCategories={availableCategories}
          tableMissing={tableMissing}
          errorCode={params.error}
          savedSuccess={params.saved === "1"}
          updatedSuccess={params.updated === "1"}
          deletedSuccess={params.deleted === "1"}
        />

        <p className="pt-10 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Monthly Budget Engine. Spending limits track verified transactions in real time without altering ledger balances.
        </p>
      </div>

      <AuraBottomNav />
    </main>
  );
}

export default function BudgetsPage({ searchParams }: BudgetsPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#10141a] pt-24 px-6 flex justify-center text-slate-400 text-xs">
          Loading budget telemetry...
        </div>
      }
    >
      <BudgetsContent searchParams={searchParams} />
    </Suspense>
  );
}
