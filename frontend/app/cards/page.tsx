import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCreditCard } from "./actions";
import { logout } from "../login/actions";
import {
  Plus,
  ArrowUpRight,
  Zap,
} from "lucide-react";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName, resolveCardholderName } from "@/lib/auth/user-display";
import { CARD_NETWORKS } from "@/lib/finance/card-networks";
import { calculateCardCreditUtilization } from "@/lib/finance/card-limit-engine";
import {
  CreditCardStackView,
  type CreditCardItem,
  type CardTransactionItem,
} from "./CreditCardStackView";
import CardsLoading from "./loading";

type CardsPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
  }>;
};

type CreditCardRow = {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
  cardholder_name?: string | null;
  card_network?: string | null;
  credit_limit_paise: number | string;
  opening_outstanding_paise: number | string;
  opening_outstanding_date: string;
  statement_day: number | null;
  payment_due_day: number | null;
};

type CardTransactionRow = {
  id: string;
  transaction_date: string;
  description: string;
  amount_paise: number | string;
  transaction_type: "card_purchase" | "card_payment" | string;
  credit_card_id: string | null;
};

function indiaToday(): string {
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

async function CardsContent({ searchParams }: CardsPageProps) {
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

  const [cardsResult, transactionsResult, emisResult] = await Promise.all([
    supabase
      .from("credit_cards")
      .select(
        "id, name, bank_name, last_four_digits, cardholder_name, card_network, credit_limit_paise, opening_outstanding_paise, opening_outstanding_date, statement_day, payment_due_day"
      )
      .eq("user_id", userId)
      .eq("is_archived", false)
      .order("created_at", { ascending: false }),

    supabase
      .from("transactions")
      .select(
        "id, transaction_date, description, amount_paise, transaction_type, credit_card_id"
      )
      .eq("user_id", userId)
      .in("transaction_type", ["card_purchase", "card_payment", "card_credit"])
      .order("transaction_date", { ascending: true }),

    supabase
      .from("emi_debts")
      .select("id, linked_credit_card_id, current_outstanding_principal_paise, status")
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const cards = (cardsResult.data ?? []) as unknown as CreditCardRow[];
  const transactions = (transactionsResult.data ?? []) as unknown as CardTransactionRow[];
  const activeEmis = emisResult.data ?? [];

  const errorMessages: Record<string, string> = {
    "invalid-input":
      "Check the card name, bank, last four digits, balance, limit and dates.",
    "save-failed":
      "We couldn't save the card. Check your database connection and try again.",
  };

  const canCalculateBalances =
    !cardsResult.error && !transactionsResult.error;

  const cardsWithBalances: CreditCardItem[] = cards.map((card) => {
    if (!canCalculateBalances) {
      return {
        ...card,
        outstandingPaise: 0,
        availablePaise: Number(card.credit_limit_paise || 0),
        utilizationPct: 0,
      };
    }

    const util = calculateCardCreditUtilization(card, transactions, activeEmis);

    return {
      ...card,
      outstandingPaise: util.totalUtilizedCreditPaise,
      availablePaise: util.availableCreditPaise,
      utilizationPct: util.utilizationPercent,
    };
  });

  const totalLimitPaise = cards.reduce(
    (total, card) => total + Number(card.credit_limit_paise),
    0
  );

  const totalOutstandingPaise = canCalculateBalances
    ? cardsWithBalances.reduce(
        (total, card) => total + card.outstandingPaise,
        0
      )
    : 0;

  const totalAvailablePaise = totalLimitPaise - totalOutstandingPaise;

  const overallUtilization =
    totalLimitPaise > 0
      ? Math.min(100, Math.round((totalOutstandingPaise / totalLimitPaise) * 100))
      : 0;

  const userEmail = user.email || "Private Client";
  const displayName = resolveDisplayName(user);
  const cardholderName = resolveCardholderName(user);

  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden selection:bg-amber-500/30 selection:text-amber-200">
      {/* Obsidian Wealth ambient atmospheric lighting */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-amber-500/10 blur-[140px] animate-pulse-glow" />
      <div className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#10b981]/10 blur-[150px] animate-pulse-glow" style={{ animationDelay: "2s" }} />
      <div className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-[#8b5cf6]/10 blur-[130px] animate-pulse-glow" style={{ animationDelay: "4s" }} />

      {/* Stitch Executive Header */}
      <AuraHeader
        sectionTitle="Cards & Wallet"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 space-y-6">
        {/* Navigation pill row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md self-start">
            <button
              type="button"
              className="rounded-full bg-[#d4af37] px-4 py-1.5 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20"
            >
              Physical Cards Stack ({cards.length})
            </button>
            <Link
              href="/cards/activity"
              className="rounded-full px-4 py-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <span>Card Activity</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Bespoke finish preview swatches from Stitch Screen 2 */}
          <div className="flex items-center gap-2 self-start sm:self-auto bg-white/5 border border-white/10 rounded-full px-3 py-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 mr-1">
              Finishes:
            </span>
            <div
              title="Obsidian Matte"
              className="h-3.5 w-3.5 rounded-full bg-[#171c24] ring-1 ring-white/40 shadow-sm cursor-pointer"
            />
            <div
              title="Ruby Velvet"
              className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-rose-500 to-rose-900 ring-1 ring-rose-400 shadow-sm cursor-pointer"
            />
            <div
              title="Auric Gold"
              className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-amber-300 to-amber-600 ring-1 ring-amber-400 shadow-sm cursor-pointer"
            />
            <div
              title="Deep Amethyst"
              className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-purple-400 to-purple-700 ring-1 ring-purple-400 shadow-sm cursor-pointer"
            />
          </div>
        </div>

        {/* Notifications & status banners */}
        {params.created === "1" && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <Zap className="h-4 w-4" />
            </div>
            <p>Credit card registered and added to your physical stack successfully.</p>
          </div>
        )}

        {params.error && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-rose-300 shadow-xl backdrop-blur-xl"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 font-bold">
              !
            </div>
            <p>{errorMessages[params.error] ?? "Something went wrong."}</p>
          </div>
        )}

        {cardsResult.error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm text-rose-300 backdrop-blur-xl"
          >
            Couldn&apos;t load your credit cards. Check connection and retry.
          </div>
        )}

        {transactionsResult.error && (
          <div
            role="alert"
            className="rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4 text-sm text-amber-300 backdrop-blur-xl"
          >
            Card records loaded, but balances cannot be calculated until transaction history is available.
          </div>
        )}

        {/* The New Interactive Stack View: Top section overall balance + Stacked cards + Selected card details & activity */}
        <CreditCardStackView
          cards={cardsWithBalances}
          transactions={transactions as CardTransactionItem[]}
          canCalculateBalances={canCalculateBalances}
          totalLimitPaise={totalLimitPaise}
          totalOutstandingPaise={totalOutstandingPaise}
          totalAvailablePaise={totalAvailablePaise}
          overallUtilization={overallUtilization}
          cardholderName={cardholderName}
        />

        {/* Add Card Module with Aura Panel Glass Form */}
        <section id="add-card-form" className="aura-panel p-6 sm:p-8 rounded-[2rem] scroll-mt-24">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/30">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Add a Credit Card
              </h2>
              <p className="text-xs text-slate-400">
                Record your card&apos;s credit limit and current balance. Never enter CVV or PIN.
              </p>
            </div>
          </div>

          <form action={createCreditCard} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Card nickname / Display name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="e.g. Neo RuPay Platinum"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-amber-400 focus:bg-white/10 focus:ring-4 focus:ring-amber-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="bankName"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Issuing bank
                </label>
                <input
                  id="bankName"
                  name="bankName"
                  required
                  maxLength={100}
                  placeholder="e.g. Axis Bank, HDFC Bank"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-amber-400 focus:bg-white/10 focus:ring-4 focus:ring-amber-400/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="cardholderName"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Name on Card
                </label>
                <input
                  id="cardholderName"
                  name="cardholderName"
                  required
                  maxLength={100}
                  placeholder="e.g. ADITYA VERMA"
                  defaultValue={cardholderName !== "PRIVATE CLIENT" ? cardholderName : ""}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white uppercase placeholder:text-slate-500 placeholder:normal-case outline-none transition-all focus:border-amber-400 focus:bg-white/10 focus:ring-4 focus:ring-amber-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="cardNetwork"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Card Network
                </label>
                <select
                  id="cardNetwork"
                  name="cardNetwork"
                  required
                  defaultValue="Visa"
                  className="w-full rounded-xl border border-white/10 bg-[#171c24] px-4 py-3 text-sm font-semibold text-white outline-none transition-all focus:border-amber-400 focus:ring-4 focus:ring-amber-400/20 cursor-pointer"
                >
                  {CARD_NETWORKS.map((network) => (
                    <option key={network} value={network} className="bg-[#171c24] text-white">
                      {network}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="lastFourDigits"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Last 4 digits (optional)
                </label>
                <input
                  id="lastFourDigits"
                  name="lastFourDigits"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  placeholder="1234"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-mono text-white placeholder:text-slate-500 outline-none transition-all focus:border-amber-400 focus:bg-white/10 focus:ring-4 focus:ring-amber-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="creditLimit"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Credit limit (₹)
                </label>
                <input
                  id="creditLimit"
                  name="creditLimit"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="e.g. 150000"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold tabular-nums text-white placeholder:text-slate-500 outline-none transition-all focus:border-amber-400 focus:bg-white/10 focus:ring-4 focus:ring-amber-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="openingOutstanding"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Current debt at start (₹)
                </label>
                <input
                  id="openingOutstanding"
                  name="openingOutstanding"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  defaultValue="0"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold tabular-nums text-white placeholder:text-slate-500 outline-none transition-all focus:border-amber-400 focus:bg-white/10 focus:ring-4 focus:ring-amber-400/20"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="openingOutstandingDate"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Balance as of date
                </label>
                <input
                  id="openingOutstandingDate"
                  name="openingOutstandingDate"
                  type="date"
                  required
                  max={indiaToday()}
                  defaultValue={indiaToday()}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-amber-400 focus:bg-white/10 focus:ring-4 focus:ring-amber-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="statementDay"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Statement day (1-31)
                </label>
                <input
                  id="statementDay"
                  name="statementDay"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="e.g. 24"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-amber-400 focus:bg-white/10 focus:ring-4 focus:ring-amber-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="paymentDueDay"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Payment due day (1-31)
                </label>
                <input
                  id="paymentDueDay"
                  name="paymentDueDay"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="e.g. 12"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-amber-400 focus:bg-white/10 focus:ring-4 focus:ring-amber-400/20"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-amber-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
            >
              Save Credit Card
            </button>
          </form>
        </section>

        {/* Footer */}
        <p className="pt-4 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Credit Card telemetry computed from verified database records.
        </p>
      </div>

      {/* Stitch Floating Dock */}
      <AuraBottomNav />
    </main>
  );
}

export default function CardsPage({ searchParams }: CardsPageProps) {
  return (
    <Suspense fallback={<CardsLoading />}>
      <CardsContent searchParams={searchParams} />
    </Suspense>
  );
}
