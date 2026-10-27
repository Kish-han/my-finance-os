/**
 * Date range boundaries and transaction aggregation utilities for AURA Wealth.
 * All calendar computations use Indian Standard Time (IST / Asia/Kolkata).
 */

export type DateRangePreset =
  | "this_week"
  | "this_month"
  | "last_6_months"
  | "this_year"
  | "all_time"
  | "custom";

export type ChartInterval = "day" | "week" | "month";

export interface TransactionRecord {
  id: string;
  transaction_date: string; // YYYY-MM-DD
  description: string;
  amount_paise: number | string;
  transaction_type:
    | "income"
    | "expense"
    | "transfer"
    | "card_purchase"
    | "card_payment";
  account_id?: string | null;
  from_account_id?: string | null;
  to_account_id?: string | null;
  credit_card_id?: string | null;
  category_id?: string | null;
}

export interface ChartBucket {
  key: string; // e.g. "2026-10-26" or "2026-10" or "2026-W43"
  label: string; // e.g. "26 Oct" or "Oct '26" or "W43"
  secondaryLabel?: string;
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
  count: number;
}

export interface RangeSummary {
  startDate: string;
  endDate: string;
  preset: DateRangePreset;
  interval: ChartInterval;
  totalIncomePaise: number;
  totalExpensePaise: number;
  netCashflowPaise: number;
  transactionCount: number;
  incomeCount: number;
  expenseCount: number;
  transferCount: number;
  savingsRatePct: number;
  buckets: ChartBucket[];
}

/**
 * Returns today's date in Indian Standard Time (Asia/Kolkata) as YYYY-MM-DD.
 */
export function getIndiaToday(refDate: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(refDate);

  const values = Object.fromEntries(
    parts.map((p) => [p.type, p.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * Parses YYYY-MM-DD into a UTC date for safe arithmetic without local timezone drift.
 */
export function parseIsoDateUtc(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Formats a Date object to YYYY-MM-DD.
 */
export function toIsoDateUtc(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Resolves the start and end dates and sensible chart interval for a given preset.
 */
export function resolveDateRangeBounds(
  preset: DateRangePreset,
  options?: {
    customStart?: string;
    customEnd?: string;
    allTimeEarliest?: string;
    referenceDate?: Date;
  }
): { startDate: string; endDate: string; interval: ChartInterval } {
  const todayStr = getIndiaToday(options?.referenceDate);
  const todayUtc = parseIsoDateUtc(todayStr);

  switch (preset) {
    case "this_week": {
      // Find Monday of the current week (ISO week: Monday = 1, Sunday = 7)
      const dayOfWeek = todayUtc.getUTCDay(); // 0 is Sunday, 1 is Monday, ...
      const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const monday = new Date(todayUtc);
      monday.setUTCDate(todayUtc.getUTCDate() - diffToMonday);

      const sunday = new Date(monday);
      sunday.setUTCDate(monday.getUTCDate() + 6);

      return {
        startDate: toIsoDateUtc(monday),
        endDate: toIsoDateUtc(sunday),
        interval: "day",
      };
    }

    case "this_month": {
      const year = todayUtc.getUTCFullYear();
      const month = todayUtc.getUTCMonth();
      const firstDay = new Date(Date.UTC(year, month, 1));
      // Last day of month
      const lastDay = new Date(Date.UTC(year, month + 1, 0));

      return {
        startDate: toIsoDateUtc(firstDay),
        endDate: toIsoDateUtc(lastDay),
        interval: "day",
      };
    }

    case "last_6_months": {
      const year = todayUtc.getUTCFullYear();
      const month = todayUtc.getUTCMonth();
      // 5 months prior + current month = 6 months
      const firstDay = new Date(Date.UTC(year, month - 5, 1));
      const lastDay = new Date(Date.UTC(year, month + 1, 0));

      return {
        startDate: toIsoDateUtc(firstDay),
        endDate: toIsoDateUtc(lastDay),
        interval: "month",
      };
    }

    case "this_year": {
      const year = todayUtc.getUTCFullYear();
      const firstDay = new Date(Date.UTC(year, 0, 1));
      const lastDay = new Date(Date.UTC(year, 11, 31));

      return {
        startDate: toIsoDateUtc(firstDay),
        endDate: toIsoDateUtc(lastDay),
        interval: "month",
      };
    }

    case "all_time": {
      const earliest = options?.allTimeEarliest && options.allTimeEarliest.length === 10
        ? options.allTimeEarliest
        : toIsoDateUtc(new Date(Date.UTC(todayUtc.getUTCFullYear() - 1, 0, 1)));

      const diffDays = Math.max(
        1,
        Math.round(
          (parseIsoDateUtc(todayStr).getTime() - parseIsoDateUtc(earliest).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );

      const interval: ChartInterval = diffDays <= 31 ? "day" : "month";
      return {
        startDate: earliest <= todayStr ? earliest : todayStr,
        endDate: todayStr,
        interval,
      };
    }

    case "custom": {
      let start = options?.customStart?.trim() || todayStr;
      let end = options?.customEnd?.trim() || todayStr;

      if (start > end) {
        const temp = start;
        start = end;
        end = temp;
      }

      const diffDays = Math.max(
        1,
        Math.round(
          (parseIsoDateUtc(end).getTime() - parseIsoDateUtc(start).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );

      let interval: ChartInterval = "day";
      if (diffDays > 90) {
        interval = "month";
      } else if (diffDays > 28) {
        interval = "week";
      } else {
        interval = "day";
      }

      return {
        startDate: start,
        endDate: end,
        interval,
      };
    }
  }
}

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Builds chronological empty buckets spanning startDate to endDate.
 */
export function generateBuckets(
  startDate: string,
  endDate: string,
  interval: ChartInterval
): ChartBucket[] {
  const buckets: ChartBucket[] = [];
  const start = parseIsoDateUtc(startDate);
  const end = parseIsoDateUtc(endDate);

  if (interval === "month") {
    const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));

    while (cur <= endMonth) {
      const year = cur.getUTCFullYear();
      const monthIdx = cur.getUTCMonth();
      const monthNum = String(monthIdx + 1).padStart(2, "0");
      const key = `${year}-${monthNum}`;
      const label = `${MONTH_NAMES_SHORT[monthIdx]}`;
      const secondaryLabel = `'${String(year).slice(-2)}`;

      buckets.push({
        key,
        label,
        secondaryLabel,
        incomePaise: 0,
        expensePaise: 0,
        netPaise: 0,
        count: 0,
      });

      cur.setUTCMonth(cur.getUTCMonth() + 1);
    }
  } else if (interval === "week") {
    // Increment in 7-day increments
    const cur = new Date(start);
    while (cur <= end) {
      const weekEnd = new Date(cur);
      weekEnd.setUTCDate(cur.getUTCDate() + 6);
      if (weekEnd > end) {
        weekEnd.setTime(end.getTime());
      }

      const key = `${toIsoDateUtc(cur)}`;
      const startDay = cur.getUTCDate();
      const startMonth = MONTH_NAMES_SHORT[cur.getUTCMonth()];
      const endDay = weekEnd.getUTCDate();
      const endMonth = MONTH_NAMES_SHORT[weekEnd.getUTCMonth()];

      const label =
        startMonth === endMonth
          ? `${startDay}–${endDay} ${startMonth}`
          : `${startDay} ${startMonth}–${endDay} ${endMonth}`;

      buckets.push({
        key,
        label,
        incomePaise: 0,
        expensePaise: 0,
        netPaise: 0,
        count: 0,
      });

      cur.setUTCDate(cur.getUTCDate() + 7);
    }
  } else {
    // Day interval
    const cur = new Date(start);
    while (cur <= end) {
      const key = toIsoDateUtc(cur);
      const day = cur.getUTCDate();
      const month = MONTH_NAMES_SHORT[cur.getUTCMonth()];
      const weekday = WEEKDAY_NAMES[cur.getUTCDay()];

      buckets.push({
        key,
        label: `${day} ${month}`,
        secondaryLabel: weekday,
        incomePaise: 0,
        expensePaise: 0,
        netPaise: 0,
        count: 0,
      });

      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  return buckets;
}

/**
 * Computes prior period bounds for comparative cashflow telemetry.
 */
export function getPriorPeriodBounds(
  startDate: string,
  endDate: string,
  preset: DateRangePreset
): { priorStart: string; priorEnd: string } {
  const start = parseIsoDateUtc(startDate);
  const end = parseIsoDateUtc(endDate);

  if (preset === "this_month") {
    const priorMonthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    const priorMonthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
    return {
      priorStart: toIsoDateUtc(priorMonthStart),
      priorEnd: toIsoDateUtc(priorMonthEnd),
    };
  }

  if (preset === "this_year") {
    const priorYearStart = new Date(Date.UTC(start.getUTCFullYear() - 1, 0, 1));
    const priorYearEnd = new Date(Date.UTC(start.getUTCFullYear() - 1, 11, 31));
    return {
      priorStart: toIsoDateUtc(priorYearStart),
      priorEnd: toIsoDateUtc(priorYearEnd),
    };
  }

  // Duration in days
  const durationMs = end.getTime() - start.getTime();
  const priorEndMs = start.getTime() - (24 * 60 * 60 * 1000);
  const priorStartMs = priorEndMs - durationMs;

  return {
    priorStart: toIsoDateUtc(new Date(priorStartMs)),
    priorEnd: toIsoDateUtc(new Date(priorEndMs)),
  };
}

export function aggregatePeriodTotals(
  transactions: TransactionRecord[],
  startDate: string,
  endDate: string
): { totalIncomePaise: number; totalExpensePaise: number } {
  let totalIncomePaise = 0;
  let totalExpensePaise = 0;

  for (const tx of transactions) {
    if (tx.transaction_date >= startDate && tx.transaction_date <= endDate) {
      const amount = Number(tx.amount_paise) || 0;
      if (tx.transaction_type === "income") {
        totalIncomePaise += amount;
      } else if (
        tx.transaction_type === "expense" ||
        tx.transaction_type === "card_purchase"
      ) {
        totalExpensePaise += amount;
      }
    }
  }

  return { totalIncomePaise, totalExpensePaise };
}

/**
 * Aggregates a list of transactions into range summaries and chart buckets.
 * Respects strict financial rules:
 * - Income: type === "income"
 * - Expense: type === "expense" || type === "card_purchase"
 * - Transfers & Card Repayments are liabilities/movements, tracked in counts but NOT double-counted in income/expense.
 */
export function aggregateTransactionRange(
  transactions: TransactionRecord[],
  preset: DateRangePreset,
  options?: {
    customStart?: string;
    customEnd?: string;
    allTimeEarliest?: string;
    referenceDate?: Date;
  }
): RangeSummary {
  const { startDate, endDate, interval } = resolveDateRangeBounds(
    preset,
    options
  );

  const buckets = generateBuckets(startDate, endDate, interval);
  const bucketMap = new Map<string, ChartBucket>();
  for (const b of buckets) {
    bucketMap.set(b.key, b);
  }

  let totalIncomePaise = 0;
  let totalExpensePaise = 0;
  let transactionCount = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let transferCount = 0;

  for (const tx of transactions) {
    const txDate = tx.transaction_date;
    if (txDate < startDate || txDate > endDate) {
      continue;
    }

    transactionCount++;
    const amount = Number(tx.amount_paise) || 0;

    // Find bucket key
    let targetKey = "";
    if (interval === "month") {
      targetKey = txDate.slice(0, 7); // YYYY-MM
    } else if (interval === "day") {
      targetKey = txDate;
    } else if (interval === "week") {
      // Find the weekly bucket that contains txDate
      for (const b of buckets) {
        if (txDate >= b.key) {
          targetKey = b.key;
        } else {
          break;
        }
      }
    }

    const bucket = bucketMap.get(targetKey);

    if (tx.transaction_type === "income") {
      totalIncomePaise += amount;
      incomeCount++;
      if (bucket) {
        bucket.incomePaise += amount;
        bucket.count++;
      }
    } else if (
      tx.transaction_type === "expense" ||
      tx.transaction_type === "card_purchase"
    ) {
      totalExpensePaise += amount;
      expenseCount++;
      if (bucket) {
        bucket.expensePaise += amount;
        bucket.count++;
      }
    } else if (
      tx.transaction_type === "transfer" ||
      tx.transaction_type === "card_payment"
    ) {
      transferCount++;
      if (bucket) {
        bucket.count++;
      }
    }
  }

  for (const b of buckets) {
    b.netPaise = b.incomePaise - b.expensePaise;
  }

  const netCashflowPaise = totalIncomePaise - totalExpensePaise;
  const savingsRatePct =
    totalIncomePaise > 0
      ? Math.max(-100, Math.min(100, Math.round((netCashflowPaise / totalIncomePaise) * 100)))
      : 0;

  return {
    startDate,
    endDate,
    preset,
    interval,
    totalIncomePaise,
    totalExpensePaise,
    netCashflowPaise,
    transactionCount,
    incomeCount,
    expenseCount,
    transferCount,
    savingsRatePct,
    buckets,
  };
}
