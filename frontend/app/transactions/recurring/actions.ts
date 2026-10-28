"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  calculateNextOccurrenceDate,
  computeInitialDueDate,
  isScheduleExpired,
  type RecurrenceFrequency,
} from "@/lib/finance/recurring-engine";

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getIndiaToday(): string {
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
  revalidatePath("/transactions/recurring");
  revalidatePath("/transactions/new");
  revalidatePath("/transactions/history");
  revalidatePath("/cards");
  revalidatePath("/cards/activity");
  revalidatePath("/accounts");
  revalidatePath("/emi");
}

export async function createRecurringSchedule(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/transactions/recurring";

  const name = String(formData.get("name") ?? "").trim();
  const flowType = String(formData.get("transactionType") ?? "").trim();
  const amountInput = String(formData.get("amount") ?? "").trim();
  const isAmountVariable = formData.get("isAmountVariable") === "true" || formData.get("isAmountVariable") === "on";
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const categoryName = String(formData.get("category") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "").trim() as RecurrenceFrequency;
  const startDate = String(formData.get("startDate") ?? "").trim();
  const endDate = String(formData.get("endDate") ?? "").trim() || null;
  const dayOfMonthInput = String(formData.get("dayOfMonth") ?? "").trim();
  const leadDaysInput = String(formData.get("leadDays") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (
    !name ||
    name.length > 160 ||
    !["income", "expense"].includes(flowType) ||
    !sourceId ||
    !categoryName ||
    categoryName.length > 60 ||
    !/^\d{1,12}(\.\d{1,2})?$/.test(amountInput) ||
    !isValidDate(startDate) ||
    (endDate && !isValidDate(endDate)) ||
    (endDate && endDate < startDate) ||
    !["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannually", "yearly"].includes(frequency)
  ) {
    redirect(`${returnTo}?error=invalid-input`);
  }

  const amountRupees = Number(amountInput);
  const amountPaise = Math.round(amountRupees * 100);

  if (!Number.isFinite(amountRupees) || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    redirect(`${returnTo}?error=invalid-input`);
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  const isCard = sourceId.startsWith("card:");
  const cleanSourceId = sourceId.replace(/^(card|account):/, "");

  let targetAccountId: string | null = null;
  let targetCreditCardId: string | null = null;

  if (isCard) {
    if (flowType === "income") {
      redirect(`${returnTo}?error=invalid-source-type`);
    }

    const { data: card, error: cardError } = await supabase
      .from("credit_cards")
      .select("id")
      .eq("id", cleanSourceId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (cardError || !card) {
      redirect(`${returnTo}?error=invalid-card`);
    }
    targetCreditCardId = card.id;
  } else {
    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", cleanSourceId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (accError || !account) {
      redirect(`${returnTo}?error=invalid-account`);
    }
    targetAccountId = account.id;
  }

  let dayOfMonth: number | null = null;
  if (dayOfMonthInput && /^\d+$/.test(dayOfMonthInput)) {
    const parsed = Number(dayOfMonthInput);
    if (parsed >= 1 && parsed <= 31) dayOfMonth = parsed;
  }
  if (!dayOfMonth && ["monthly", "bimonthly", "quarterly", "semiannually", "yearly"].includes(frequency)) {
    dayOfMonth = Number(startDate.split("-")[2]);
  }

  const leadDays = leadDaysInput && /^\d+$/.test(leadDaysInput) ? Number(leadDaysInput) : 3;
  const today = getIndiaToday();
  const nextDueDate = computeInitialDueDate({
    startDate,
    today,
    frequency,
    dayOfMonth,
  });

  // 1. Insert Category if needed
  let categoryId: string | null = null;
  const { data: existingCat } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", categoryName)
    .maybeSingle();

  if (existingCat?.id) {
    categoryId = existingCat.id;
  } else {
    const { data: createdCat } = await supabase
      .from("categories")
      .insert({
        user_id: userId,
        name: categoryName,
        category_type: flowType,
      })
      .select("id")
      .maybeSingle();
    categoryId = createdCat?.id || null;
  }

  // 2. Insert Schedule
  const { data: schedule, error: insertError } = await supabase
    .from("recurring_schedules")
    .insert({
      user_id: userId,
      name,
      transaction_type: flowType,
      amount_paise: amountPaise,
      is_amount_variable: isAmountVariable,
      account_id: targetAccountId,
      credit_card_id: targetCreditCardId,
      category_id: categoryId,
      category_name: categoryName,
      frequency,
      day_of_month: dayOfMonth,
      start_date: startDate,
      end_date: endDate,
      next_due_date: nextDueDate,
      status: "active",
      lead_days: leadDays,
      notes,
    })
    .select("id")
    .single();

  if (insertError || !schedule) {
    redirect(`${returnTo}?error=save-failed`);
  }

  // 3. Immediately insert initial pending occurrence for nextDueDate
  await supabase
    .from("recurring_occurrences")
    .insert({
      user_id: userId,
      schedule_id: schedule.id,
      due_date: nextDueDate,
      expected_amount_paise: amountPaise,
      status: "pending",
    })
    .select()
    .maybeSingle();

  revalidateAllFinancialPaths();
  redirect(`${returnTo}?created=1`);
}

export async function updateRecurringSchedule(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/transactions/recurring";
  const scheduleId = String(formData.get("scheduleId") ?? "").trim();

  const name = String(formData.get("name") ?? "").trim();
  const amountInput = String(formData.get("amount") ?? "").trim();
  const isAmountVariable = formData.get("isAmountVariable") === "true" || formData.get("isAmountVariable") === "on";
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const categoryName = String(formData.get("category") ?? "").trim();
  const frequency = String(formData.get("frequency") ?? "").trim() as RecurrenceFrequency;
  const endDate = String(formData.get("endDate") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (
    !scheduleId ||
    !name ||
    name.length > 160 ||
    !sourceId ||
    !categoryName ||
    !/^\d{1,12}(\.\d{1,2})?$/.test(amountInput) ||
    !["weekly", "biweekly", "monthly", "bimonthly", "quarterly", "semiannually", "yearly"].includes(frequency)
  ) {
    redirect(`${returnTo}?error=invalid-input`);
  }

  const amountRupees = Number(amountInput);
  const amountPaise = Math.round(amountRupees * 100);

  if (!Number.isFinite(amountRupees) || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    redirect(`${returnTo}?error=invalid-input`);
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  // Fetch existing schedule
  const { data: schedule, error: fetchErr } = await supabase
    .from("recurring_schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr || !schedule) {
    redirect(`${returnTo}?error=not-found`);
  }

  const isCard = sourceId.startsWith("card:");
  const cleanSourceId = sourceId.replace(/^(card|account):/, "");

  let targetAccountId: string | null = null;
  let targetCreditCardId: string | null = null;

  if (isCard) {
    if (schedule.transaction_type === "income") {
      redirect(`${returnTo}?error=invalid-source-type`);
    }

    const { data: card, error: cardError } = await supabase
      .from("credit_cards")
      .select("id")
      .eq("id", cleanSourceId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (cardError || !card) {
      redirect(`${returnTo}?error=invalid-card`);
    }
    targetCreditCardId = card.id;
  } else {
    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("id")
      .eq("id", cleanSourceId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (accError || !account) {
      redirect(`${returnTo}?error=invalid-account`);
    }
    targetAccountId = account.id;
  }

  // Update schedule
  const { error: updateErr } = await supabase
    .from("recurring_schedules")
    .update({
      name,
      amount_paise: amountPaise,
      is_amount_variable: isAmountVariable,
      account_id: targetAccountId,
      credit_card_id: targetCreditCardId,
      category_name: categoryName,
      frequency,
      end_date: endDate,
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId)
    .eq("user_id", userId);

  if (updateErr) {
    redirect(`${returnTo}?error=save-failed`);
  }

  // Update pending occurrence expected amount to keep in sync
  await supabase
    .from("recurring_occurrences")
    .update({
      expected_amount_paise: amountPaise,
      updated_at: new Date().toISOString(),
    })
    .eq("schedule_id", scheduleId)
    .eq("status", "pending");

  revalidateAllFinancialPaths();
  redirect(`${returnTo}?updated=1`);
}

export async function pauseRecurringSchedule(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/transactions/recurring";
  const scheduleId = String(formData.get("scheduleId") ?? "").trim();

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (typeof userId !== "string") redirect("/login");

  await supabase
    .from("recurring_schedules")
    .update({ status: "paused", updated_at: new Date().toISOString() })
    .eq("id", scheduleId)
    .eq("user_id", userId);

  revalidateAllFinancialPaths();
  redirect(`${returnTo}?paused=1`);
}

export async function resumeRecurringSchedule(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/transactions/recurring";
  const scheduleId = String(formData.get("scheduleId") ?? "").trim();

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (typeof userId !== "string") redirect("/login");

  await supabase
    .from("recurring_schedules")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("id", scheduleId)
    .eq("user_id", userId);

  revalidateAllFinancialPaths();
  redirect(`${returnTo}?resumed=1`);
}

export async function archiveRecurringSchedule(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/transactions/recurring";
  const scheduleId = String(formData.get("scheduleId") ?? "").trim();

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (typeof userId !== "string") redirect("/login");

  // Archive schedule and remove its pending occurrences so they don't clutter reminders
  await supabase
    .from("recurring_schedules")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", scheduleId)
    .eq("user_id", userId);

  await supabase
    .from("recurring_occurrences")
    .delete()
    .eq("schedule_id", scheduleId)
    .eq("status", "pending")
    .eq("user_id", userId);

  revalidateAllFinancialPaths();
  redirect(`${returnTo}?archived=1`);
}

export async function confirmRecurringOccurrence(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/";
  const occurrenceId = String(formData.get("occurrenceId") ?? "").trim();
  const scheduleId = String(formData.get("scheduleId") ?? "").trim();

  const description = String(formData.get("description") ?? "").trim();
  const amountInput = String(formData.get("amount") ?? "").trim();
  const transactionDate = String(formData.get("transactionDate") ?? "").trim();
  const categoryName = String(formData.get("category") ?? "").trim();
  const sourceId = String(formData.get("sourceId") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (
    !occurrenceId ||
    !scheduleId ||
    !description ||
    description.length > 160 ||
    !sourceId ||
    !categoryName ||
    !/^\d{1,12}(\.\d{1,2})?$/.test(amountInput) ||
    !isValidDate(transactionDate) ||
    transactionDate > getIndiaToday()
  ) {
    redirect(`${returnTo}?error=invalid-input`);
  }

  const amountRupees = Number(amountInput);
  const amountPaise = Math.round(amountRupees * 100);

  if (!Number.isFinite(amountRupees) || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    redirect(`${returnTo}?error=invalid-input`);
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

  // 1. Fetch occurrence & check idempotency
  const { data: occ, error: occError } = await supabase
    .from("recurring_occurrences")
    .select("*")
    .eq("id", occurrenceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (occError || !occ) {
    redirect(`${returnTo}?error=occurrence-not-found`);
  }

  // IDEMPOTENCY GUARD: If already confirmed, do not create a duplicate transaction!
  if (occ.status === "confirmed") {
    redirect(`${returnTo}?confirmed=1`);
  }

  // 2. Fetch Schedule
  const { data: schedule, error: schedError } = await supabase
    .from("recurring_schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("user_id", userId)
    .maybeSingle();

  if (schedError || !schedule) {
    redirect(`${returnTo}?error=schedule-not-found`);
  }

  // 3. Resolve & validate Financial Source
  const isCard = sourceId.startsWith("card:");
  const cleanSourceId = sourceId.replace(/^(card|account):/, "");

  let resolvedType: "income" | "expense" | "card_purchase";
  let targetAccountId: string | null = null;
  let targetCreditCardId: string | null = null;

  if (isCard) {
    if (schedule.transaction_type === "income") {
      redirect(`${returnTo}?error=invalid-source-type`);
    }

    const { data: card, error: cardError } = await supabase
      .from("credit_cards")
      .select("id, opening_outstanding_date")
      .eq("id", cleanSourceId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (cardError || !card || transactionDate < card.opening_outstanding_date) {
      redirect(`${returnTo}?error=invalid-card-or-date`);
    }

    resolvedType = "card_purchase";
    targetCreditCardId = card.id;
  } else {
    const { data: account, error: accError } = await supabase
      .from("accounts")
      .select("id, opening_balance_date")
      .eq("id", cleanSourceId)
      .eq("user_id", userId)
      .eq("is_archived", false)
      .maybeSingle();

    if (accError || !account || transactionDate < account.opening_balance_date) {
      redirect(`${returnTo}?error=invalid-account-or-date`);
    }

    resolvedType = schedule.transaction_type;
    targetAccountId = account.id;
  }

  // 4. Resolve category
  let categoryId: string | null = null;
  const { data: existingCat } = await supabase
    .from("categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", categoryName)
    .maybeSingle();

  if (existingCat?.id) {
    categoryId = existingCat.id;
  } else {
    const { data: createdCat } = await supabase
      .from("categories")
      .insert({
        user_id: userId,
        name: categoryName,
        category_type: schedule.transaction_type,
      })
      .select("id")
      .maybeSingle();
    categoryId = createdCat?.id || null;
  }

  const finalDescription = notes ? `${description} · ${notes}`.slice(0, 160) : description;

  // 5. Create actual financial transaction
  const { data: newTx, error: txError } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      transaction_date: transactionDate,
      description: finalDescription,
      amount_paise: amountPaise,
      transaction_type: resolvedType,
      account_id: targetAccountId,
      credit_card_id: targetCreditCardId,
      category_id: categoryId,
    })
    .select("id")
    .single();

  if (txError || !newTx) {
    // Transaction creation failed: keep occurrence pending and retryable!
    redirect(`${returnTo}?error=save-failed`);
  }

  // 6. Transaction succeeded: mark occurrence confirmed
  await supabase
    .from("recurring_occurrences")
    .update({
      status: "confirmed",
      confirmed_transaction_id: newTx.id,
      confirmed_amount_paise: amountPaise,
      confirmed_at: new Date().toISOString(),
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", occurrenceId)
    .eq("user_id", userId);

  // 7. Advance schedule next_due_date and generate next occurrence
  const nextDate = calculateNextOccurrenceDate({
    currentDueDate: occ.due_date,
    frequency: schedule.frequency as RecurrenceFrequency,
    anchorDayOfMonth: schedule.day_of_month != null ? Number(schedule.day_of_month) : null,
  });

  const isExpired = isScheduleExpired(nextDate, schedule.end_date);

  await supabase
    .from("recurring_schedules")
    .update({
      next_due_date: nextDate,
      status: isExpired ? "completed" : schedule.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schedule.id);

  if (!isExpired && schedule.status === "active") {
    // Generate next pending occurrence
    await supabase
      .from("recurring_occurrences")
      .insert({
        user_id: userId,
        schedule_id: schedule.id,
        due_date: nextDate,
        expected_amount_paise: schedule.amount_paise,
        status: "pending",
      })
      .select()
      .maybeSingle();
  }

  revalidateAllFinancialPaths();
  redirect(`${returnTo}?confirmed=1`);
}

export async function skipRecurringOccurrence(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/";
  const occurrenceId = String(formData.get("occurrenceId") ?? "").trim();
  const scheduleId = String(formData.get("scheduleId") ?? "").trim();

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (typeof userId !== "string") redirect("/login");

  const { data: occ } = await supabase
    .from("recurring_occurrences")
    .select("due_date")
    .eq("id", occurrenceId)
    .eq("user_id", userId)
    .maybeSingle();

  const { data: schedule } = await supabase
    .from("recurring_schedules")
    .select("*")
    .eq("id", scheduleId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!occ || !schedule) {
    redirect(`${returnTo}?error=not-found`);
  }

  // 1. Mark occurrence skipped
  await supabase
    .from("recurring_occurrences")
    .update({
      status: "skipped",
      updated_at: new Date().toISOString(),
    })
    .eq("id", occurrenceId)
    .eq("user_id", userId);

  // 2. Advance schedule next_due_date
  const nextDate = calculateNextOccurrenceDate({
    currentDueDate: occ.due_date,
    frequency: schedule.frequency as RecurrenceFrequency,
    anchorDayOfMonth: schedule.day_of_month != null ? Number(schedule.day_of_month) : null,
  });

  const isExpired = isScheduleExpired(nextDate, schedule.end_date);

  await supabase
    .from("recurring_schedules")
    .update({
      next_due_date: nextDate,
      status: isExpired ? "completed" : schedule.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", schedule.id);

  if (!isExpired && schedule.status === "active") {
    await supabase
      .from("recurring_occurrences")
      .insert({
        user_id: userId,
        schedule_id: schedule.id,
        due_date: nextDate,
        expected_amount_paise: schedule.amount_paise,
        status: "pending",
      })
      .select()
      .maybeSingle();
  }

  revalidateAllFinancialPaths();
  redirect(`${returnTo}?skipped=1`);
}

export async function snoozeRecurringOccurrence(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "").trim() || "/";
  const occurrenceId = String(formData.get("occurrenceId") ?? "").trim();
  const snoozeUntilDate = String(formData.get("snoozeUntilDate") ?? "").trim();

  if (!occurrenceId || !isValidDate(snoozeUntilDate)) {
    redirect(`${returnTo}?error=invalid-date`);
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;

  if (typeof userId !== "string") redirect("/login");

  await supabase
    .from("recurring_occurrences")
    .update({
      snoozed_until_date: snoozeUntilDate,
      updated_at: new Date().toISOString(),
    })
    .eq("id", occurrenceId)
    .eq("user_id", userId);

  revalidateAllFinancialPaths();
  redirect(`${returnTo}?snoozed=1`);
}
