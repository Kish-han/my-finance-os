import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "../../login/actions";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { getIndiaToday } from "@/lib/finance/payment-schedule";
import {
  fetchUserRecurringSchedules,
  fetchUserPendingOccurrences,
} from "@/lib/finance/recurring-data";
import {
  RecurringTransactionsView,
  type HistoryOccurrenceItem,
} from "./RecurringTransactionsView";

type RecurringPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
    updated?: string;
    confirmed?: string;
    skipped?: string;
    snoozed?: string;
    paused?: string;
    resumed?: string;
    archived?: string;
  }>;
};

async function RecurringContent({ searchParams }: RecurringPageProps) {
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
  const today = getIndiaToday();

  // Parallel fetch: Accounts, Cards, Categories, Recurring Schedules, and Pending Occurrences
  const [
    accountsResult,
    cardsResult,
    categoriesResult,
    schedulesResult,
    pendingResult,
  ] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, account_type, institution")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("credit_cards")
      .select("id, name, bank_name, last_four_digits")
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("name"),

    supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", userId)
      .eq("is_archived", false),

    fetchUserRecurringSchedules(supabase, userId),
    fetchUserPendingOccurrences(supabase, userId, today),
  ]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (accountsResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creditCards = (cardsResult.data ?? []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categories = (categoriesResult.data ?? []).map((c: any) => c.name);

  // Fetch occurrence history (confirmed and skipped)
  let historyItems: HistoryOccurrenceItem[] = [];
  try {
    const { data: histData } = await supabase
      .from("recurring_occurrences")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["confirmed", "skipped"])
      .order("due_date", { ascending: false })
      .limit(50);

    const scheduleMap = new Map(schedulesResult.schedules.map((s) => [s.id, s]));
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const cardMap = new Map(creditCards.map((c) => [c.id, c]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    historyItems = (histData || []).map((row: any) => {
      const schedule = scheduleMap.get(row.schedule_id);
      let sourceLabel = "Liquid Account";
      if (schedule?.creditCardId) {
        const c = cardMap.get(schedule.creditCardId);
        sourceLabel = c ? `${c.bank_name} ${c.name}` : "Credit Card";
      } else if (schedule?.accountId) {
        const a = accountMap.get(schedule.accountId);
        sourceLabel = a ? a.name : "Bank Account";
      }

      return {
        id: row.id,
        scheduleName: schedule?.name || "Recurring Item",
        transactionType: schedule?.transactionType || "expense",
        dueDate: row.due_date,
        expectedAmountPaise: Number(row.expected_amount_paise),
        status: row.status as "confirmed" | "skipped",
        confirmedAmountPaise: row.confirmed_amount_paise != null ? Number(row.confirmed_amount_paise) : null,
        confirmedAt: row.confirmed_at,
        confirmedTransactionId: row.confirmed_transaction_id,
        sourceLabel,
        notes: row.notes,
      };
    });
  } catch {
    // Non-fatal if table doesn't exist
  }

  const defaultCategories = [
    "Salary",
    "Housing & Rent",
    "Utilities & Bills",
    "Subscriptions & Streaming",
    "Internet & Mobile",
    "Insurance",
    "Gym & Fitness",
    "Groceries",
    "Education & Tuition",
    "Other",
  ];

  const availableCategories = Array.from(new Set([...categories, ...defaultCategories]));

  const errorMessages: Record<string, string> = {
    "invalid-input": "Check your schedule name, amount, dates, frequency and payment source.",
    "invalid-source-type": "Credit cards cannot be chosen as deposit destinations for recurring income.",
    "invalid-card": "Selected credit card is invalid or archived.",
    "invalid-account": "Selected bank or cash account is invalid or archived.",
    "invalid-card-or-date": "Selected credit card is invalid or payment date is before its opening date.",
    "invalid-account-or-date": "Selected account is invalid or payment date is before its opening balance date.",
    "occurrence-not-found": "This expected occurrence was not found or has already been settled.",
    "schedule-not-found": "Associated recurring schedule could not be found.",
    "save-failed": "Could not save transaction to database. Occurrence remains pending.",
  };

  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3]">
      {/* Obsidian Wealth ambient atmospheric lighting */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-purple-500/10 blur-[150px] animate-pulse-glow" />
      <div
        className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#10b981]/10 blur-[160px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-indigo-500/10 blur-[130px] animate-pulse-glow"
        style={{ animationDelay: "4s" }}
      />

      <AuraHeader
        sectionTitle="Recurring Rules & Reminders"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6">
        <RecurringTransactionsView
          schedules={schedulesResult.schedules}
          pendingItems={pendingResult.pendingItems}
          historyItems={historyItems}
          accounts={accounts}
          creditCards={creditCards}
          categories={availableCategories}
          today={today}
          createdSuccess={params.created === "1"}
          updatedSuccess={params.updated === "1"}
          confirmedSuccess={params.confirmed === "1"}
          skippedSuccess={params.skipped === "1"}
          snoozedSuccess={params.snoozed === "1"}
          pausedSuccess={params.paused === "1"}
          resumedSuccess={params.resumed === "1"}
          archivedSuccess={params.archived === "1"}
          tableMissing={schedulesResult.tableMissing || pendingResult.tableMissing}
          errorCode={params.error}
          errorMessages={errorMessages}
        />

        <p className="pt-10 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Recurring Transaction Engine. Expected occurrences never alter balances until explicitly confirmed.
        </p>
      </div>

      <AuraBottomNav />
    </main>
  );
}

export default function RecurringPage({ searchParams }: RecurringPageProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#10141a] pt-24 px-6 flex justify-center text-slate-400 text-xs">
          Loading recurring telemetry...
        </div>
      }
    >
      <RecurringContent searchParams={searchParams} />
    </Suspense>
  );
}
