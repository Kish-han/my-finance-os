import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateOverallMetrics,
  calculatePersonSummaries,
  calculateRecordBalance,
} from "./money-tracker-engine";
import type {
  FinancialAccount,
  MoneyTrackerMetrics,
  Person,
  PersonSummary,
  PersonalMoneyRecord,
  PersonalMoneyRepayment,
  RecordBalance,
} from "./types";

interface DbPerson {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface DbAccount {
  id: string;
  name: string;
  account_type: "bank" | "cash";
  institution: string | null;
  opening_balance_paise: number | string;
  opening_balance_date: string;
  is_archived: boolean;
}

interface DbMoneyRecord {
  id: string;
  user_id: string;
  person_id: string;
  direction: "given" | "taken";
  amount_paise: number | string;
  record_date: string;
  due_date: string | null;
  account_id: string;
  linked_transaction_id: string | null;
  status: "active" | "settled";
  notes: string | null;
  created_at: string;
  updated_at: string;
  people?: DbPerson | null;
  accounts?: DbAccount | null;
}

interface DbMoneyRepayment {
  id: string;
  user_id: string;
  record_id: string;
  amount_paise: number | string;
  repayment_date: string;
  account_id: string;
  linked_transaction_id: string | null;
  notes: string | null;
  created_at: string;
  accounts?: DbAccount | null;
}

type DbRecord = Record<string, unknown>;

export function mapDbAccountToDomain(acc: DbAccount): FinancialAccount {
  return {
    id: acc.id,
    name: acc.name,
    type: acc.account_type,
    institution: acc.institution ?? undefined,
    openingBalancePaise: Number(acc.opening_balance_paise) || 0,
    openingBalanceDate: acc.opening_balance_date,
    isArchived: acc.is_archived,
  };
}

export function mapDbPersonToDomain(p: DbPerson | DbRecord): Person {
  return {
    id: String(p.id ?? ""),
    userId: p.user_id ? String(p.user_id) : undefined,
    name: String(p.name ?? ""),
    phone: p.phone ? String(p.phone) : null,
    notes: p.notes ? String(p.notes) : null,
    createdAt: p.created_at ? String(p.created_at) : undefined,
    updatedAt: p.updated_at ? String(p.updated_at) : undefined,
  };
}

export function mapDbMoneyRecordToDomain(
  l: DbMoneyRecord | DbRecord,
  peopleMap: Map<string, Person>
): PersonalMoneyRecord {
  const rawPerson = Array.isArray(l.people) ? l.people[0] : l.people;
  const person = rawPerson
    ? mapDbPersonToDomain(rawPerson as DbRecord)
    : peopleMap.get(String(l.person_id ?? "")) ?? {
        id: String(l.person_id ?? ""),
        name: "Unknown Contact",
      };

  const rawAccount = Array.isArray(l.accounts) ? l.accounts[0] : l.accounts;
  const account = rawAccount
    ? mapDbAccountToDomain(rawAccount as DbAccount)
    : undefined;

  const raw = l as DbRecord;
  return {
    id: String(l.id ?? ""),
    userId: l.user_id ? String(l.user_id) : undefined,
    personId: String(l.person_id ?? ""),
    direction: (l.direction as "given" | "taken") || "given",
    amountPaise: Number(l.amount_paise ?? raw.principal_amount_paise) || 0,
    recordDate: String(l.record_date ?? raw.agreement_date ?? ""),
    dueDate: l.due_date ? String(l.due_date) : raw.expected_repayment_date ? String(raw.expected_repayment_date) : null,
    accountId: String(l.account_id ?? ""),
    linkedTransactionId: l.linked_transaction_id
      ? String(l.linked_transaction_id)
      : null,
    status: (l.status as "active" | "settled") || "active",
    notes: l.notes ? String(l.notes) : null,
    createdAt: l.created_at ? String(l.created_at) : undefined,
    updatedAt: l.updated_at ? String(l.updated_at) : undefined,
    person,
    account,
  };
}

export function mapDbRepaymentToDomain(
  p: DbMoneyRepayment | DbRecord
): PersonalMoneyRepayment {
  const rawAccount = Array.isArray(p.accounts) ? p.accounts[0] : p.accounts;
  const raw = p as DbRecord;
  return {
    id: String(p.id ?? ""),
    userId: p.user_id ? String(p.user_id) : undefined,
    recordId: String(p.record_id ?? raw.personal_loan_id ?? ""),
    amountPaise: Number(p.amount_paise ?? raw.payment_amount_paise) || 0,
    repaymentDate: String(p.repayment_date ?? raw.payment_date ?? ""),
    accountId: String(p.account_id ?? ""),
    linkedTransactionId: p.linked_transaction_id
      ? String(p.linked_transaction_id)
      : null,
    notes: p.notes ? String(p.notes) : null,
    createdAt: p.created_at ? String(p.created_at) : undefined,
    account: rawAccount
      ? mapDbAccountToDomain(rawAccount as DbAccount)
      : undefined,
  };
}

export interface MoneyTrackerDataBundle {
  people: Person[];
  records: PersonalMoneyRecord[];
  repayments: PersonalMoneyRepayment[];
  metrics: MoneyTrackerMetrics;
  peopleSummaries: PersonSummary[];
  accounts: FinancialAccount[];
  // Backwards compatibility alias
  agreements: PersonalMoneyRecord[];
  payments: PersonalMoneyRepayment[];
}

export async function fetchMoneyTrackerData(
  supabase: SupabaseClient
): Promise<MoneyTrackerDataBundle> {
  const [
    { data: dbPeople },
    { data: dbAccounts },
    { data: dbRecords },
    { data: dbRepayments },
  ] = await Promise.all([
    supabase
      .from("people")
      .select("id, user_id, name, phone, notes, created_at, updated_at")
      .order("name"),
    supabase
      .from("accounts")
      .select(
        "id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived"
      )
      .eq("is_archived", false)
      .order("name"),
    supabase
      .from("personal_money_records")
      .select(
        `
        id, user_id, person_id, direction, amount_paise, record_date,
        due_date, account_id, linked_transaction_id, status, notes,
        created_at, updated_at,
        people ( id, user_id, name, phone, notes, created_at, updated_at ),
        accounts ( id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived )
      `
      )
      .order("record_date", { ascending: false }),
    supabase
      .from("personal_money_repayments")
      .select(
        `
        id, user_id, record_id, amount_paise, repayment_date, account_id, linked_transaction_id,
        notes, created_at,
        accounts ( id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived )
      `
      )
      .order("repayment_date", { ascending: true }),
  ]);

  const peopleMap = new Map<string, Person>();
  const people: Person[] = (dbPeople || []).map((p: DbPerson) => {
    const domainPerson = mapDbPersonToDomain(p);
    peopleMap.set(domainPerson.id, domainPerson);
    return domainPerson;
  });

  const accounts: FinancialAccount[] = (dbAccounts || []).map((a: DbAccount) =>
    mapDbAccountToDomain(a)
  );

  const records: PersonalMoneyRecord[] = (dbRecords || []).map(
    (l: unknown) => mapDbMoneyRecordToDomain(l as DbRecord, peopleMap)
  );

  const repayments: PersonalMoneyRepayment[] = (dbRepayments || []).map(
    (p: unknown) => mapDbRepaymentToDomain(p as DbRecord)
  );

  const metrics = calculateOverallMetrics(records, repayments);

  const peopleSummaries = calculatePersonSummaries(
    people,
    records,
    repayments
  );

  return {
    people,
    records,
    repayments,
    metrics,
    peopleSummaries,
    accounts,
    agreements: records,
    payments: repayments,
  };
}

/**
 * Lightweight metrics query for dashboard overview.
 * Avoids joining people, accounts, and calculating per-person summaries.
 */
export async function fetchMoneyTrackerMetrics(
  supabase: SupabaseClient
): Promise<MoneyTrackerMetrics | null> {
  try {
    const [
      { data: dbRecords, error: recordsError },
      { data: dbRepayments, error: repaymentsError },
    ] = await Promise.all([
      supabase
        .from("personal_money_records")
        .select("id, direction, amount_paise, status"),
      supabase
        .from("personal_money_repayments")
        .select("record_id, amount_paise"),
    ]);

    if (recordsError || repaymentsError || !dbRecords) {
      return null;
    }

    const records: PersonalMoneyRecord[] = dbRecords.map((r) => ({
      id: String(r.id),
      direction: (r.direction as "given" | "taken") || "given",
      amountPaise: Number(r.amount_paise) || 0,
      status: (r.status as "active" | "settled") || "active",
      personId: "",
      recordDate: "",
      dueDate: null,
      accountId: "",
      linkedTransactionId: null,
      notes: null,
    }));

    const repayments: PersonalMoneyRepayment[] = (dbRepayments || []).map((p) => ({
      id: "",
      recordId: String(p.record_id),
      amountPaise: Number(p.amount_paise) || 0,
      repaymentDate: "",
      accountId: "",
      linkedTransactionId: null,
      notes: null,
    }));

    return calculateOverallMetrics(records, repayments);
  } catch {
    return null;
  }
}

export async function fetchRecordDetail(
  supabase: SupabaseClient,
  recordId: string
): Promise<{
  record: PersonalMoneyRecord | null;
  repayments: PersonalMoneyRepayment[];
  balance: RecordBalance | null;
  accounts: FinancialAccount[];
  // Backwards compatibility alias
  agreement: PersonalMoneyRecord | null;
  payments: PersonalMoneyRepayment[];
}> {
  const [
    { data: dbRecord },
    { data: dbRepayments },
    { data: dbAccounts },
  ] = await Promise.all([
    supabase
      .from("personal_money_records")
      .select(
        `
        id, user_id, person_id, direction, amount_paise, record_date,
        due_date, account_id, linked_transaction_id, status, notes,
        created_at, updated_at,
        people ( id, user_id, name, phone, notes, created_at, updated_at ),
        accounts ( id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived )
      `
      )
      .eq("id", recordId)
      .single(),
    supabase
      .from("personal_money_repayments")
      .select(
        `
        id, user_id, record_id, amount_paise, repayment_date, account_id, linked_transaction_id,
        notes, created_at,
        accounts ( id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived )
      `
      )
      .eq("record_id", recordId)
      .order("repayment_date", { ascending: true }),
    supabase
      .from("accounts")
      .select(
        "id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived"
      )
      .eq("is_archived", false)
      .order("name"),
  ]);

  if (!dbRecord) {
    return {
      record: null,
      repayments: [],
      balance: null,
      accounts: [],
      agreement: null,
      payments: [],
    };
  }

  const peopleMap = new Map<string, Person>();
  const record = mapDbMoneyRecordToDomain(dbRecord as DbRecord, peopleMap);
  const repayments = (dbRepayments || []).map((p: unknown) =>
    mapDbRepaymentToDomain(p as DbRecord)
  );
  const balance = calculateRecordBalance(record, repayments);
  const accounts = (dbAccounts || []).map((a: DbAccount) =>
    mapDbAccountToDomain(a)
  );

  return {
    record,
    repayments,
    balance,
    accounts,
    agreement: record,
    payments: repayments,
  };
}

export const fetchAgreementDetail = fetchRecordDetail;
export const mapDbLoanToDomain = mapDbMoneyRecordToDomain;
export const mapDbPaymentToDomain = mapDbRepaymentToDomain;
