import {
  type RecurringScheduleRecord,
  type RecurringOccurrenceRecord,
  type RecurrenceFrequency,
  type ScheduleStatus,
  formatFrequencyDescription,
  getOccurrenceDueStatus,
} from "./recurring-engine";
import type { RecurringTransactionPaymentItem } from "./payment-schedule";

export interface ScheduleWithMeta extends RecurringScheduleRecord {
  accountName?: string | null;
  accountType?: string | null;
  cardName?: string | null;
  cardBankName?: string | null;
  cardLastFour?: string | null;
  pendingOccurrence?: RecurringOccurrenceRecord | null;
}

export interface OccurrenceWithSchedule extends RecurringOccurrenceRecord {
  scheduleName: string;
  transactionType: "income" | "expense";
  frequency: RecurrenceFrequency;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  isAmountVariable: boolean;
  accountId?: string | null;
  creditCardId?: string | null;
  categoryName?: string | null;
  sourceLabel: string;
  isCreditCard: boolean;
}

/**
 * Safely fetches active and paused recurring schedules for the authenticated user.
 * Catches table missing errors gracefully so unmigrated databases do not crash.
 */
export async function fetchUserRecurringSchedules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string
): Promise<{ schedules: RecurringScheduleRecord[]; error: string | null; tableMissing: boolean }> {
  try {
    const { data, error } = await supabase
      .from("recurring_schedules")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "archived")
      .order("next_due_date", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      const isMissing =
        error.code === "42P01" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("schema cache");
      return { schedules: [], error: error.message, tableMissing: isMissing };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schedules: RecurringScheduleRecord[] = (data || []).map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      transactionType: row.transaction_type,
      amountPaise: Number(row.amount_paise),
      isAmountVariable: Boolean(row.is_amount_variable),
      accountId: row.account_id,
      creditCardId: row.credit_card_id,
      categoryId: row.category_id,
      categoryName: row.category_name,
      frequency: row.frequency as RecurrenceFrequency,
      dayOfMonth: row.day_of_month != null ? Number(row.day_of_month) : null,
      dayOfWeek: row.day_of_week != null ? Number(row.day_of_week) : null,
      startDate: row.start_date,
      endDate: row.end_date,
      nextDueDate: row.next_due_date,
      status: row.status as ScheduleStatus,
      leadDays: Number(row.lead_days || 3),
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    return { schedules, error: null, tableMissing: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { schedules: [], error: message, tableMissing: false };
  }
}

/**
 * Ensures that active schedules have their pending occurrence record generated in the database.
 * Uses ON CONFLICT DO NOTHING to guarantee idempotency and avoid duplicates.
 */
export async function ensurePendingOccurrencesForSchedules(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  schedules: RecurringScheduleRecord[]
): Promise<void> {
  const activeSchedules = schedules.filter((s) => s.status === "active");
  if (activeSchedules.length === 0) return;

  try {
    for (const schedule of activeSchedules) {
      // Check if an occurrence already exists for this schedule and next_due_date
      const { data: existing } = await supabase
        .from("recurring_occurrences")
        .select("id, status")
        .eq("schedule_id", schedule.id)
        .eq("due_date", schedule.nextDueDate)
        .maybeSingle();

      if (!existing) {
        await supabase
          .from("recurring_occurrences")
          .insert({
            user_id: userId,
            schedule_id: schedule.id,
            due_date: schedule.nextDueDate,
            expected_amount_paise: schedule.amountPaise,
            status: "pending",
          })
          .select()
          .maybeSingle();
      }
    }
  } catch {
    // Non-fatal if occurrence generation fails
  }
}

/**
 * Fetches pending occurrences mapped with their schedule metadata.
 */
export async function fetchUserPendingOccurrences(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  today: string
): Promise<{
  pendingItems: RecurringTransactionPaymentItem[];
  error: string | null;
  tableMissing: boolean;
}> {
  try {
    const { schedules, error: schedError, tableMissing } =
      await fetchUserRecurringSchedules(supabase, userId);

    if (tableMissing || schedError || schedules.length === 0) {
      return { pendingItems: [], error: schedError, tableMissing };
    }

    // Ensure pending occurrence rows exist for active schedules
    await ensurePendingOccurrencesForSchedules(supabase, userId, schedules);

    // Fetch accounts and credit cards to provide human labels
    const [accRes, cardRes, occRes] = await Promise.all([
      supabase.from("accounts").select("id, name, account_type, institution").eq("user_id", userId),
      supabase.from("credit_cards").select("id, name, bank_name, last_four_digits").eq("user_id", userId),
      supabase
        .from("recurring_occurrences")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "pending")
        .order("due_date", { ascending: true }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = (accRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cards = (cardRes.data || []) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const occurrences = (occRes.data || []) as any[];

    const scheduleMap = new Map(schedules.map((s) => [s.id, s]));
    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const cardMap = new Map(cards.map((c) => [c.id, c]));

    const pendingItems: RecurringTransactionPaymentItem[] = [];

    for (const occ of occurrences) {
      const schedule = scheduleMap.get(occ.schedule_id);
      // If schedule is archived or paused, skip active reminder
      if (!schedule || schedule.status !== "active") continue;

      let sourceLabel = "Liquid Account";
      let isCreditCard = false;

      if (schedule.creditCardId) {
        const card = cardMap.get(schedule.creditCardId);
        sourceLabel = card
          ? `${card.bank_name} ${card.name}${card.last_four_digits ? ` (••${card.last_four_digits})` : ""}`
          : "Credit Card";
        isCreditCard = true;
      } else if (schedule.accountId) {
        const acc = accountMap.get(schedule.accountId);
        sourceLabel = acc ? acc.name : "Bank Account";
      }

      const frequencyText = formatFrequencyDescription(
        schedule.frequency,
        schedule.dayOfMonth,
        schedule.dayOfWeek
      );

      const dueStatusResult = getOccurrenceDueStatus({
        dueDate: occ.due_date,
        today,
        status: "pending",
        snoozedUntilDate: occ.snoozed_until_date,
      });

      pendingItems.push({
        id: `recurring-occ-${occ.id}`,
        kind: "recurring_transaction",
        scheduleId: schedule.id,
        occurrenceId: occ.id,
        title: schedule.name,
        subtitle: `${frequencyText} · ${sourceLabel}`,
        transactionType: schedule.transactionType,
        dueDate: dueStatusResult.effectiveDueDate,
        originalDueDate: occ.due_date,
        dueStatus: dueStatusResult.dueStatus,
        amountPaise: Number(occ.expected_amount_paise),
        isAmountVariable: schedule.isAmountVariable,
        isSnoozed: dueStatusResult.isSnoozed,
        snoozedUntilDate: occ.snoozed_until_date,
        accountId: schedule.accountId,
        creditCardId: schedule.creditCardId,
        accountOrCardLabel: sourceLabel,
        isCreditCard,
        categoryName: schedule.categoryName,
        isPaid: false,
        confirmedTransactionId: occ.confirmed_transaction_id,
        confirmedAmountPaise: occ.confirmed_amount_paise != null ? Number(occ.confirmed_amount_paise) : null,
        notes: occ.notes || schedule.notes,
      });
    }

    return { pendingItems, error: null, tableMissing: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { pendingItems: [], error: message, tableMissing: false };
  }
}
