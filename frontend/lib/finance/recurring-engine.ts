import { getPaymentDueStatus, type DueStatusInfo } from "./payment-schedule";

export type RecurrenceFrequency =
  | "weekly"
  | "biweekly"
  | "monthly"
  | "bimonthly"
  | "quarterly"
  | "semiannually"
  | "yearly";

export type ScheduleStatus = "active" | "paused" | "completed" | "archived";
export type OccurrenceStatus = "pending" | "confirmed" | "skipped";

export interface RecurringScheduleRecord {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  transactionType: "income" | "expense";
  amountPaise: number;
  isAmountVariable: boolean;
  accountId?: string | null;
  creditCardId?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number | null;
  dayOfWeek?: number | null;
  startDate: string; // YYYY-MM-DD
  endDate?: string | null; // YYYY-MM-DD
  nextDueDate: string; // YYYY-MM-DD
  status: ScheduleStatus;
  leadDays: number;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface RecurringOccurrenceRecord {
  id: string;
  userId: string;
  scheduleId: string;
  dueDate: string; // YYYY-MM-DD
  expectedAmountPaise: number;
  status: OccurrenceStatus;
  snoozedUntilDate?: string | null; // YYYY-MM-DD
  confirmedTransactionId?: string | null;
  confirmedAmountPaise?: number | null;
  confirmedAt?: string | null;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Every 2 Weeks",
  monthly: "Monthly",
  bimonthly: "Every 2 Months",
  quarterly: "Quarterly",
  semiannually: "Every 6 Months",
  yearly: "Yearly",
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Returns human-friendly text describing the recurring frequency and schedule timing.
 */
export function formatFrequencyDescription(
  frequency: RecurrenceFrequency,
  dayOfMonth?: number | null,
  dayOfWeek?: number | null
): string {
  switch (frequency) {
    case "weekly":
      return dayOfWeek != null && dayOfWeek >= 0 && dayOfWeek <= 6
        ? `Weekly on ${DAY_NAMES[dayOfWeek]}s`
        : "Weekly";
    case "biweekly":
      return dayOfWeek != null && dayOfWeek >= 0 && dayOfWeek <= 6
        ? `Every 2 weeks on ${DAY_NAMES[dayOfWeek]}s`
        : "Every 2 weeks";
    case "monthly":
      return dayOfMonth != null
        ? `Monthly on the ${ordinal(dayOfMonth)}`
        : "Monthly";
    case "bimonthly":
      return dayOfMonth != null
        ? `Every 2 months on the ${ordinal(dayOfMonth)}`
        : "Every 2 months";
    case "quarterly":
      return dayOfMonth != null
        ? `Quarterly on the ${ordinal(dayOfMonth)}`
        : "Quarterly";
    case "semiannually":
      return dayOfMonth != null
        ? `Every 6 months on the ${ordinal(dayOfMonth)}`
        : "Every 6 months";
    case "yearly":
      return dayOfMonth != null
        ? `Yearly on the ${ordinal(dayOfMonth)}`
        : "Yearly";
    default:
      return frequency;
  }
}

/**
 * Computes the next scheduled due date (YYYY-MM-DD) based on frequency and anchor date.
 * Handles month-end clamping (e.g. 31st Jan -> 28th/29th Feb -> 31st Mar) without date drift.
 * All computations use UTC year/month/date math to prevent local timezone offsets from shifting dates.
 */
export function calculateNextOccurrenceDate(params: {
  currentDueDate: string; // YYYY-MM-DD
  frequency: RecurrenceFrequency;
  anchorDayOfMonth?: number | null; // 1-31
}): string {
  const { currentDueDate, frequency, anchorDayOfMonth } = params;
  const [yStr, mStr, dStr] = currentDueDate.split("-");
  const year = Number(yStr);
  const month = Number(mStr);
  const day = Number(dStr);

  if (!year || !month || !day) {
    throw new Error(`Invalid currentDueDate: ${currentDueDate}`);
  }

  // Determine the preserved anchor day of month
  const preservedAnchorDay =
    typeof anchorDayOfMonth === "number" && anchorDayOfMonth >= 1 && anchorDayOfMonth <= 31
      ? anchorDayOfMonth
      : day;

  if (frequency === "weekly") {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + 7);
    return toIsoDateString(d);
  }

  if (frequency === "biweekly") {
    const d = new Date(Date.UTC(year, month - 1, day));
    d.setUTCDate(d.getUTCDate() + 14);
    return toIsoDateString(d);
  }

  let monthsToAdd = 1;
  switch (frequency) {
    case "monthly":
      monthsToAdd = 1;
      break;
    case "bimonthly":
      monthsToAdd = 2;
      break;
    case "quarterly":
      monthsToAdd = 3;
      break;
    case "semiannually":
      monthsToAdd = 6;
      break;
    case "yearly":
      monthsToAdd = 12;
      break;
  }

  const totalMonths = year * 12 + (month - 1) + monthsToAdd;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;

  // Maximum days in target month (e.g. 28/29 for Feb, 30 for Apr, 31 for Jan)
  const daysInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(preservedAnchorDay, daysInTargetMonth);

  const yOut = String(targetYear);
  const mOut = String(targetMonth).padStart(2, "0");
  const dOut = String(clampedDay).padStart(2, "0");

  return `${yOut}-${mOut}-${dOut}`;
}

function toIsoDateString(d: Date): string {
  const y = String(d.getUTCFullYear());
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Checks whether a schedule has expired because nextDueDate exceeds its configured endDate.
 */
export function isScheduleExpired(
  nextDueDate: string,
  endDate?: string | null
): boolean {
  if (!endDate) return false;
  return nextDueDate > endDate;
}

/**
 * Calculates monthly normalized equivalent amount in paise.
 * Used for high-level recurring budget analytics and projected monthly outflow/inflow.
 */
export function normalizeMonthlyAmountPaise(
  amountPaise: number,
  frequency: RecurrenceFrequency
): number {
  if (amountPaise <= 0) return 0;

  switch (frequency) {
    case "weekly":
      return Math.round((amountPaise * 52) / 12);
    case "biweekly":
      return Math.round((amountPaise * 26) / 12);
    case "monthly":
      return amountPaise;
    case "bimonthly":
      return Math.round(amountPaise / 2);
    case "quarterly":
      return Math.round(amountPaise / 3);
    case "semiannually":
      return Math.round(amountPaise / 6);
    case "yearly":
      return Math.round(amountPaise / 12);
  }
}

/**
 * Computes due status for an occurrence considering snooze date.
 */
export function getOccurrenceDueStatus(params: {
  dueDate: string;
  today: string;
  status: OccurrenceStatus;
  snoozedUntilDate?: string | null;
}): {
  effectiveDueDate: string;
  isSnoozed: boolean;
  dueStatus: DueStatusInfo;
} {
  const { dueDate, today, status, snoozedUntilDate } = params;
  const isPaid = status === "confirmed";

  const isSnoozed =
    status === "pending" &&
    Boolean(snoozedUntilDate) &&
    (snoozedUntilDate as string) > dueDate &&
    (snoozedUntilDate as string) >= today;

  const effectiveDueDate = isSnoozed ? (snoozedUntilDate as string) : dueDate;
  const dueStatus = getPaymentDueStatus(effectiveDueDate, today, isPaid);

  if (isSnoozed) {
    return {
      effectiveDueDate,
      isSnoozed: true,
      dueStatus: {
        ...dueStatus,
        label: `Snoozed until ${effectiveDueDate}`,
      },
    };
  }

  return {
    effectiveDueDate,
    isSnoozed: false,
    dueStatus,
  };
}

/**
 * Generates initial next due date from schedule start date and anchor configuration.
 */
export function computeInitialDueDate(params: {
  startDate: string;
  today: string;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number | null;
}): string {
  const { startDate, today, dayOfMonth } = params;

  // If startDate is today or in the future, start on startDate (or clamped to dayOfMonth)
  if (startDate >= today) {
    if (
      dayOfMonth != null &&
      ["monthly", "bimonthly", "quarterly", "semiannually", "yearly"].includes(params.frequency)
    ) {
      const [y, m] = startDate.split("-").map(Number);
      const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
      const clamped = Math.min(dayOfMonth, daysInMonth);
      const candidate = `${y}-${String(m).padStart(2, "0")}-${String(clamped).padStart(2, "0")}`;
      if (candidate >= startDate) {
        return candidate;
      }
      return calculateNextOccurrenceDate({
        currentDueDate: candidate,
        frequency: params.frequency,
        anchorDayOfMonth: dayOfMonth,
      });
    }
    return startDate;
  }

  // If startDate was in the past, calculate from startDate
  return startDate;
}
