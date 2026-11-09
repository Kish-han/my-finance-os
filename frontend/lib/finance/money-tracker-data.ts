import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calculateAgreementBalance,
  calculateOverallMoneyTrackerMetrics,
  calculatePersonBalances,
} from "./money-tracker-engine";
import type {
  AgreementBalance,
  FinancialAccount,
  MoneyTrackerMetrics,
  Person,
  PersonBalanceSummary,
  PersonalLoanAgreement,
  PersonalLoanPayment,
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

interface DbPersonalLoan {
  id: string;
  user_id: string;
  person_id: string;
  direction: "given" | "taken";
  principal_amount_paise: number | string;
  interest_type: "none" | "fixed_amount" | "simple_annual";
  interest_rate_basis_points: number;
  agreed_interest_paise: number | string;
  agreement_date: string;
  expected_repayment_date: string | null;
  account_id: string;
  linked_transaction_id: string | null;
  status: "active" | "settled";
  notes: string | null;
  created_at: string;
  updated_at: string;
  people?: DbPerson | null;
  accounts?: DbAccount | null;
}

interface DbPersonalPayment {
  id: string;
  user_id: string;
  personal_loan_id: string;
  payment_amount_paise: number | string;
  principal_component_paise: number | string;
  interest_component_paise: number | string;
  payment_date: string;
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

export function mapDbLoanToDomain(
  l: DbPersonalLoan | DbRecord,
  peopleMap: Map<string, Person>
): PersonalLoanAgreement {
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

  return {
    id: String(l.id ?? ""),
    userId: l.user_id ? String(l.user_id) : undefined,
    personId: String(l.person_id ?? ""),
    direction: (l.direction as "given" | "taken") || "given",
    principalPaise: Number(l.principal_amount_paise) || 0,
    interestType:
      (l.interest_type as "none" | "fixed_amount" | "simple_annual") || "none",
    interestRateAnnualBasisPoints: Number(l.interest_rate_basis_points) || 0,
    agreedInterestPaise: Number(l.agreed_interest_paise) || 0,
    agreementDate: String(l.agreement_date ?? ""),
    expectedRepaymentDate: l.expected_repayment_date
      ? String(l.expected_repayment_date)
      : null,
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

export function mapDbPaymentToDomain(
  p: DbPersonalPayment | DbRecord
): PersonalLoanPayment {
  const rawAccount = Array.isArray(p.accounts) ? p.accounts[0] : p.accounts;
  return {
    id: String(p.id ?? ""),
    userId: p.user_id ? String(p.user_id) : undefined,
    personalLoanId: String(p.personal_loan_id ?? ""),
    paymentAmountPaise: Number(p.payment_amount_paise) || 0,
    principalComponentPaise: Number(p.principal_component_paise) || 0,
    interestComponentPaise: Number(p.interest_component_paise) || 0,
    paymentDate: String(p.payment_date ?? ""),
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
  agreements: PersonalLoanAgreement[];
  payments: PersonalLoanPayment[];
  metrics: MoneyTrackerMetrics;
  peopleSummaries: PersonBalanceSummary[];
  accounts: FinancialAccount[];
}

export async function fetchMoneyTrackerData(
  supabase: SupabaseClient
): Promise<MoneyTrackerDataBundle> {
  const [
    { data: dbPeople },
    { data: dbAccounts },
    { data: dbLoans },
    { data: dbPayments },
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
      .from("personal_loans")
      .select(
        `
        id, user_id, person_id, direction, principal_amount_paise, interest_type,
        interest_rate_basis_points, agreed_interest_paise, agreement_date,
        expected_repayment_date, account_id, linked_transaction_id, status, notes,
        created_at, updated_at,
        people ( id, user_id, name, phone, notes, created_at, updated_at ),
        accounts ( id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived )
      `
      )
      .order("agreement_date", { ascending: false }),
    supabase
      .from("personal_loan_payments")
      .select(
        `
        id, user_id, personal_loan_id, payment_amount_paise, principal_component_paise,
        interest_component_paise, payment_date, account_id, linked_transaction_id,
        notes, created_at,
        accounts ( id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived )
      `
      )
      .order("payment_date", { ascending: true }),
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

  const agreements: PersonalLoanAgreement[] = (dbLoans || []).map(
    (l: unknown) => mapDbLoanToDomain(l as DbRecord, peopleMap)
  );

  const payments: PersonalLoanPayment[] = (dbPayments || []).map(
    (p: unknown) => mapDbPaymentToDomain(p as DbRecord)
  );

  const metrics = calculateOverallMoneyTrackerMetrics(agreements, payments);

  const peopleSummaries = people.map((person) =>
    calculatePersonBalances(person, agreements, payments)
  );

  return {
    people,
    agreements,
    payments,
    metrics,
    peopleSummaries,
    accounts,
  };
}

export async function fetchAgreementDetail(
  supabase: SupabaseClient,
  agreementId: string
): Promise<{
  agreement: PersonalLoanAgreement | null;
  payments: PersonalLoanPayment[];
  balance: AgreementBalance | null;
  accounts: FinancialAccount[];
}> {
  const [
    { data: dbLoan },
    { data: dbPayments },
    { data: dbAccounts },
  ] = await Promise.all([
    supabase
      .from("personal_loans")
      .select(
        `
        id, user_id, person_id, direction, principal_amount_paise, interest_type,
        interest_rate_basis_points, agreed_interest_paise, agreement_date,
        expected_repayment_date, account_id, linked_transaction_id, status, notes,
        created_at, updated_at,
        people ( id, user_id, name, phone, notes, created_at, updated_at ),
        accounts ( id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived )
      `
      )
      .eq("id", agreementId)
      .single(),
    supabase
      .from("personal_loan_payments")
      .select(
        `
        id, user_id, personal_loan_id, payment_amount_paise, principal_component_paise,
        interest_component_paise, payment_date, account_id, linked_transaction_id,
        notes, created_at,
        accounts ( id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived )
      `
      )
      .eq("personal_loan_id", agreementId)
      .order("payment_date", { ascending: true }),
    supabase
      .from("accounts")
      .select(
        "id, name, account_type, institution, opening_balance_paise, opening_balance_date, is_archived"
      )
      .eq("is_archived", false)
      .order("name"),
  ]);

  if (!dbLoan) {
    return {
      agreement: null,
      payments: [],
      balance: null,
      accounts: [],
    };
  }

  const peopleMap = new Map<string, Person>();
  const agreement = mapDbLoanToDomain(dbLoan as DbRecord, peopleMap);
  const payments = (dbPayments || []).map((p: unknown) =>
    mapDbPaymentToDomain(p as DbRecord)
  );
  const balance = calculateAgreementBalance(agreement, payments);
  const accounts = (dbAccounts || []).map((a: DbAccount) =>
    mapDbAccountToDomain(a)
  );

  return {
    agreement,
    payments,
    balance,
    accounts,
  };
}
