"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Calendar,
  CheckCircle2,
  Plus,
  ArrowRight,
  X,
  Percent,
  Receipt,
  FileText,
  Sparkles,
} from "lucide-react";
import type {
  UpcomingPaymentItem,
  CreditCardStatementPaymentItem,
  CreditCardReminderPaymentItem,
  StandaloneLoanPaymentItem,
} from "@/lib/finance/payment-schedule";
import { calculateDueDateFromStatementDate } from "@/lib/finance/statement-engine";
import {
  recordStatementPayment,
  saveCardStatement,
} from "./cards/statements/actions";

interface Props {
  activePayments: UpcomingPaymentItem[];
  settledPayments: UpcomingPaymentItem[];
  cards: Array<{
    id: string;
    label: string;
    paymentDueDay: number | null;
    statementDay: number | null;
    outstandingPaise?: number;
  }>;
  accounts: Array<{
    id: string;
    label: string;
    balancePaise: number;
  }>;
  today: string;
}

interface PaymentModalData {
  creditCardId: string;
  statementId: string | null;
  cardTitle: string;
  dueDate: string | null;
  statementDate: string | null;
  statementBalancePaise: number | null;
  remainingPaise: number | null;
  isPartiallyPaid: boolean;
  paidPaise: number;
  cardOutstandingPaise: number;
  isAutoCalculated?: boolean;
}

function formatRupees(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function UpcomingPaymentsCenter({
  activePayments,
  settledPayments,
  cards,
  accounts,
  today,
}: Props) {
  const [paymentModalData, setPaymentModalData] = useState<PaymentModalData | null>(null);
  const [showAddStatementModal, setShowAddStatementModal] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Payment form state
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? "");
  const [repayAmount, setRepayAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [paymentNotes, setPaymentNotes] = useState("");

  // Statement form state
  const [stmtCardId, setStmtCardId] = useState(cards[0]?.id ?? "");
  const [stmtDate, setStmtDate] = useState(today);
  const [stmtDueDate, setStmtDueDate] = useState(today);
  const [stmtBalance, setStmtBalance] = useState("");
  const [stmtMinDue, setStmtMinDue] = useState("");
  const [stmtNotes, setStmtNotes] = useState("");

  function openPaymentModalForStatement(stmt: CreditCardStatementPaymentItem) {
    const card = cards.find((c) => c.id === stmt.creditCardId);
    const cardOutstandingPaise = card?.outstandingPaise ?? stmt.amountPaise;

    setPaymentModalData({
      creditCardId: stmt.creditCardId,
      statementId: stmt.statementId,
      cardTitle: stmt.title,
      dueDate: stmt.dueDate,
      statementDate: stmt.statementDate,
      statementBalancePaise: stmt.statementBalancePaise,
      remainingPaise: stmt.remainingPaise,
      isPartiallyPaid: stmt.isPartiallyPaid,
      paidPaise: stmt.paidPaise,
      cardOutstandingPaise,
      isAutoCalculated: stmt.isAutoCalculated,
    });

    setRepayAmount((stmt.remainingPaise / 100).toFixed(2));
    setPaymentDate(today);
    setPaymentNotes(`Payment for statement due ${stmt.dueDate}`);
    setIsConfirmed(false);
    if (accounts.length > 0) {
      setFromAccountId(accounts[0].id);
    }
  }

  function openPaymentModalForCard(cardId: string, customAmountPaise?: number) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;

    const cardOutstandingPaise = card.outstandingPaise ?? 0;
    const initialAmountPaise = customAmountPaise ?? cardOutstandingPaise;

    setPaymentModalData({
      creditCardId: card.id,
      statementId: null,
      cardTitle: card.label,
      dueDate: null,
      statementDate: null,
      statementBalancePaise: null,
      remainingPaise: null,
      isPartiallyPaid: false,
      paidPaise: 0,
      cardOutstandingPaise,
    });

    setRepayAmount(initialAmountPaise > 0 ? (initialAmountPaise / 100).toFixed(2) : "");
    setPaymentDate(today);
    setPaymentNotes(`Credit card payment - ${card.label}`);
    setIsConfirmed(false);
    if (accounts.length > 0) {
      setFromAccountId(accounts[0].id);
    }
  }

  function openAddStatementModal(cardId?: string) {
    const targetCardId = cardId || cards[0]?.id || "";
    setStmtCardId(targetCardId);
    setStmtDate(today);

    const card = cards.find((c) => c.id === targetCardId);
    if (card?.paymentDueDay) {
      setStmtDueDate(calculateDueDateFromStatementDate(today, card.paymentDueDay));
    } else {
      setStmtDueDate(today);
    }

    setStmtBalance("");
    setStmtMinDue("");
    setStmtNotes("");
    setShowAddStatementModal(true);
  }

  function handleStmtDateChange(newDate: string) {
    setStmtDate(newDate);
    const card = cards.find((c) => c.id === stmtCardId);
    if (card?.paymentDueDay && newDate) {
      setStmtDueDate(calculateDueDateFromStatementDate(newDate, card.paymentDueDay));
    }
  }

  function handleStmtCardChange(newCardId: string) {
    setStmtCardId(newCardId);
    const card = cards.find((c) => c.id === newCardId);
    if (card?.paymentDueDay && stmtDate) {
      setStmtDueDate(calculateDueDateFromStatementDate(stmtDate, card.paymentDueDay));
    }
  }

  const inputClass =
    "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-cyan-400 focus:bg-white/10 focus:ring-4 focus:ring-cyan-400/20";

  return (
    <section className="mt-8 space-y-4">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-400 animate-pulse" />
          <h2 className="text-lg sm:text-xl font-black tracking-tight text-white flex items-center gap-2">
            <span>Upcoming Payments</span>
            {activePayments.length > 0 && (
              <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-xs font-bold text-cyan-300 border border-cyan-500/30">
                {activePayments.length} pending
              </span>
            )}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {cards.length > 0 && (
            <button
              type="button"
              onClick={() => openAddStatementModal()}
              className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 px-3.5 py-1.5 text-xs font-bold text-cyan-300 transition-all shadow-sm cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Statement</span>
            </button>
          )}

          {settledPayments.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-slate-300 transition-all cursor-pointer"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span>{showHistory ? "Hide Settled" : `Settled (${settledPayments.length})`}</span>
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-400 -mt-2">
        Actionable credit card statement payments and scheduled loan installments in chronological due-date order
      </p>

      {/* Active Payments List */}
      {activePayments.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-emerald-500/20 bg-emerald-950/10 p-8 text-center backdrop-blur-xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-lg">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-bold text-white">All upcoming payments clear</p>
          <p className="mt-1 text-xs text-slate-400">
            No pending credit card bills or scheduled loan installments are due right now.
          </p>
          {cards.length > 0 && (
            <button
              type="button"
              onClick={() => openAddStatementModal()}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md hover:bg-cyan-400 transition-all cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Record New Statement</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {activePayments.map((item) => {
            const isOverdue = item.dueStatus.status === "overdue";
            const isDueToday = item.dueStatus.status === "due_today";
            const isDueSoon = item.dueStatus.status === "due_soon";

            // Status border and glow
            const borderStyle = isOverdue
              ? "border-rose-500/40 bg-gradient-to-r from-rose-950/30 via-slate-900/60 to-slate-900/60 shadow-[0_0_20px_-5px_rgba(244,63,94,0.2)]"
              : isDueToday
              ? "border-amber-500/40 bg-gradient-to-r from-amber-950/30 via-slate-900/60 to-slate-900/60 shadow-[0_0_20px_-5px_rgba(245,158,11,0.2)]"
              : isDueSoon
              ? "border-cyan-500/30 bg-slate-900/70"
              : "border-white/10 bg-slate-900/60";

            const statusBadgeColor = isOverdue
              ? "bg-rose-500/20 text-rose-300 border-rose-500/30"
              : isDueToday
              ? "bg-amber-500/20 text-amber-300 border-amber-500/30 animate-pulse"
              : isDueSoon
              ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
              : "bg-slate-800 text-slate-300 border-white/10";

            if (item.kind === "credit_card_statement") {
              const stmt = item as CreditCardStatementPaymentItem;
              return (
                <article
                  key={stmt.id}
                  className={`aura-panel relative p-4 sm:p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 ${borderStyle}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    {/* Left: Info */}
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm mt-0.5">
                        <CreditCard className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-bold text-white text-sm sm:text-base">
                            {stmt.title}
                          </h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${statusBadgeColor}`}
                          >
                            {stmt.dueStatus.label}
                          </span>
                          {stmt.isAutoCalculated && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold">
                              <Sparkles className="h-2.5 w-2.5" />
                              Auto-Calculated
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            <Calendar className="h-3 w-3 text-cyan-400" />
                            Due: {formatDate(stmt.dueDate)}
                          </span>
                          <span>·</span>
                          <span className="text-slate-400">
                            Cutoff: {formatDate(stmt.statementDate)}
                          </span>
                          {stmt.minimumDuePaise !== null && (
                            <>
                              <span>·</span>
                              <span className="text-slate-400">
                                Min Due: {formatRupees(stmt.minimumDuePaise)}
                              </span>
                            </>
                          )}
                        </div>

                        {stmt.isPartiallyPaid && (
                          <p className="text-[11px] text-amber-300">
                            Partially paid: {formatRupees(stmt.paidPaise)} cleared · {formatRupees(stmt.remainingPaise)} remaining
                          </p>
                        )}

                        {stmt.notes && (
                          <p className="text-[11px] text-slate-400 italic">
                            {stmt.notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Amount & Action */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10 shrink-0">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Statement Due
                        </span>
                        <span className="text-lg sm:text-2xl font-black text-white tabular-nums drop-shadow-sm">
                          {formatRupees(stmt.amountPaise)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => openPaymentModalForStatement(stmt)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <span>Record Payment</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            }

            if (item.kind === "credit_card_reminder") {
              const reminder = item as CreditCardReminderPaymentItem;
              const hasEstimate = (reminder.amountPaise || 0) > 0;

              return (
                <article
                  key={reminder.id}
                  className="aura-panel p-4 sm:p-5 rounded-2xl border border-purple-500/30 bg-purple-950/20 backdrop-blur-md transition-all hover:-translate-y-0.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300 border border-purple-500/30 mt-0.5">
                        <FileText className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-bold text-white text-sm sm:text-base">
                            {reminder.title}
                          </h3>
                          <span className="rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 text-[10px] font-bold">
                            {hasEstimate ? "Current Cycle (Estimated)" : "Statement Pending"}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            <Calendar className="h-3 w-3 text-purple-400" />
                            Next Expected Due: {formatDate(reminder.dueDate)}
                          </span>
                          {reminder.statementDay && (
                            <>
                              <span>·</span>
                              <span className="text-slate-400">
                                Cutoff day: {reminder.statementDay}th
                              </span>
                            </>
                          )}
                          {reminder.paymentDueDay && (
                            <>
                              <span>·</span>
                              <span className="text-slate-400">
                                Due day: {reminder.paymentDueDay}th
                              </span>
                            </>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400">
                          {hasEstimate
                            ? "Unbilled spending in progress. Statement will finalize automatically on cutoff."
                            : "Statement amount has not yet been recorded for this billing cycle."}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10 shrink-0">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          {hasEstimate ? "Estimated Spend" : "Amount Due"}
                        </span>
                        {hasEstimate ? (
                          <span className="text-lg sm:text-2xl font-black text-purple-300 tabular-nums drop-shadow-sm">
                            {formatRupees(reminder.amountPaise)}
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-slate-400 italic">
                            Pending statement
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {hasEstimate && (
                          <button
                            type="button"
                            onClick={() => openPaymentModalForCard(reminder.creditCardId, reminder.amountPaise)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-md transition-all active:scale-95 cursor-pointer"
                          >
                            <span>Pay Now</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openAddStatementModal(reminder.creditCardId)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-purple-400/40 bg-purple-500/20 hover:bg-purple-500/30 px-3.5 py-2 text-xs font-bold text-purple-200 transition-all cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Enter Statement</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            }

            if (item.kind === "standalone_loan") {
              const loan = item as StandaloneLoanPaymentItem;
              return (
                <article
                  key={loan.id}
                  className={`aura-panel relative p-4 sm:p-5 rounded-2xl border transition-all duration-300 hover:-translate-y-0.5 ${borderStyle}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm mt-0.5">
                        <Percent className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-bold text-white text-sm sm:text-base">
                            {loan.title}
                          </h3>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${statusBadgeColor}`}
                          >
                            {loan.dueStatus.label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            <Calendar className="h-3 w-3 text-cyan-400" />
                            Due: {formatDate(loan.dueDate)}
                          </span>
                          <span>·</span>
                          <span className="text-slate-300 font-medium">{loan.subtitle}</span>
                          {loan.nextInstallmentNumber !== null && (
                            <>
                              <span>·</span>
                              <span className="text-slate-400">
                                Instalment #{loan.nextInstallmentNumber} of {loan.totalTenureMonths}
                              </span>
                            </>
                          )}
                        </div>

                        {(loan.expectedPrincipalPaise !== undefined ||
                          loan.expectedInterestPaise !== undefined) && (
                          <p className="text-[11px] text-slate-400">
                            Principal: {formatRupees(loan.expectedPrincipalPaise ?? 0)} · Interest: {formatRupees(loan.expectedInterestPaise ?? 0)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/10 shrink-0">
                      <div className="text-left sm:text-right">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Instalment Due
                        </span>
                        <span className="text-lg sm:text-2xl font-black text-white tabular-nums drop-shadow-sm">
                          {formatRupees(loan.amountPaise)}
                        </span>
                      </div>

                      <Link
                        href={`/emi/payments?debt_id=${loan.debtId}`}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 px-4 py-2 text-xs font-bold text-slate-950 shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <span>Record EMI</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            }

            return null;
          })}
        </div>
      )}

      {/* History / Settled Section */}
      {showHistory && settledPayments.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/10 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span>Settled Statements & Cleared Instalments</span>
            </h3>
            <span className="text-xs text-slate-500">{settledPayments.length} completed</span>
          </div>

          <div className="space-y-2.5">
            {settledPayments.map((item) => (
              <article
                key={item.id}
                className="flex items-center justify-between p-3.5 rounded-xl border border-white/5 bg-white/[0.02] text-xs text-slate-400"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{item.title}</p>
                    <p className="text-[11px] text-slate-500">
                      Due: {formatDate(item.dueDate)} · {item.subtitle}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-bold text-emerald-400 font-mono">
                    {formatRupees(
                      item.kind === "credit_card_statement"
                        ? (item as CreditCardStatementPaymentItem).statementBalancePaise
                        : item.amountPaise
                    )}
                  </span>
                  <span className="block text-[10px] uppercase font-bold text-emerald-500">
                    Fully Settled
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Modal 1: Flexible Credit Card Payment Modal */}
      {paymentModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Record Credit Card Payment
                  </h3>
                  <p className="text-xs text-slate-400">{paymentModalData.cardTitle}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPaymentModalData(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form action={recordStatementPayment} className="space-y-4">
              <input type="hidden" name="credit_card_id" value={paymentModalData.creditCardId} />
              {paymentModalData.statementId && (
                <input type="hidden" name="statement_id" value={paymentModalData.statementId} />
              )}

              {/* Financial Snapshot Summary */}
              <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span>Current Total Card Outstanding:</span>
                  <strong className="text-white font-mono text-sm">
                    {formatRupees(paymentModalData.cardOutstandingPaise)}
                  </strong>
                </div>

                {paymentModalData.remainingPaise !== null && (
                  <>
                    <div className="flex justify-between items-center text-slate-300">
                      <span>Statement Due Date:</span>
                      <strong className="text-white font-mono">
                        {paymentModalData.dueDate ? formatDate(paymentModalData.dueDate) : "Pending"}
                      </strong>
                    </div>

                    <div className="flex justify-between items-center text-slate-300">
                      <span>Total Statement Bill:</span>
                      <strong className="text-amber-300 font-mono">
                        {formatRupees(paymentModalData.statementBalancePaise ?? 0)}
                      </strong>
                    </div>

                    {paymentModalData.isPartiallyPaid && (
                      <div className="flex justify-between items-center text-emerald-400">
                        <span>Previously Cleared:</span>
                        <strong className="font-mono">
                          {formatRupees(paymentModalData.paidPaise)}
                        </strong>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-1.5 border-t border-amber-500/20 text-white font-bold">
                      <span>Remaining Statement Balance:</span>
                      <span className="text-base text-emerald-400 font-black font-mono">
                        {formatRupees(paymentModalData.remainingPaise)}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Payment Account (Bank or Cash)
                </label>
                <select
                  name="from_account_id"
                  required
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                  className={inputClass}
                >
                  <option value="" className="bg-slate-900 text-slate-400">Select payment account</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                      {acc.label} ({formatRupees(acc.balancePaise)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Payment Amount (₹)
                  </label>
                  <input
                    type="number"
                    name="amount_rupees"
                    step="0.01"
                    min="0.01"
                    required
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    placeholder="15000.00"
                    className={`${inputClass} font-semibold tabular-nums`}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Supports partial or full statement repayment.
                  </span>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    name="payment_date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Pay anytime before, on, or after cutoff.
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Transaction Description
                </label>
                <input
                  type="text"
                  name="description"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* Confirmation Step */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-3">
                <input
                  type="checkbox"
                  id="confirm-payment"
                  checked={isConfirmed}
                  onChange={(e) => setIsConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                />
                <label htmlFor="confirm-payment" className="text-xs text-slate-300 leading-relaxed cursor-pointer select-none">
                  I confirm recording this payment. This will debit your bank account exactly once and reduce your card liability via an authorized card payment transaction.
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalData(null)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!isConfirmed || !fromAccountId || !repayAmount}
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Confirm & Record Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Add Statement Modal */}
      {showAddStatementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-lg rounded-3xl border border-white/15 bg-slate-900/95 p-6 shadow-2xl backdrop-blur-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    Record Credit Card Statement
                  </h3>
                  <p className="text-xs text-slate-400">
                    Enter the verified billing statement for this cycle
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddStatementModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form action={saveCardStatement} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Credit Card
                </label>
                <select
                  name="credit_card_id"
                  required
                  value={stmtCardId}
                  onChange={(e) => handleStmtCardChange(e.target.value)}
                  className={inputClass}
                >
                  {cards.map((c) => (
                    <option key={c.id} value={c.id} className="bg-slate-900 text-white">
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Statement Date
                  </label>
                  <input
                    type="date"
                    name="statement_date"
                    required
                    value={stmtDate}
                    onChange={(e) => handleStmtDateChange(e.target.value)}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Billing cycle closing date.
                  </span>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Payment Due Date
                  </label>
                  <input
                    type="date"
                    name="payment_due_date"
                    required
                    value={stmtDueDate}
                    onChange={(e) => setStmtDueDate(e.target.value)}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Lender payment deadline.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Statement Balance Due (₹)
                  </label>
                  <input
                    type="number"
                    name="statement_balance_rupees"
                    step="0.01"
                    min="0"
                    required
                    value={stmtBalance}
                    onChange={(e) => setStmtBalance(e.target.value)}
                    placeholder="e.g. 15000.00"
                    className={`${inputClass} font-semibold tabular-nums`}
                  />
                  <span className="mt-1 block text-[11px] text-amber-300/80">
                    Total amount payable (including billed EMIs & charges).
                  </span>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                    Minimum Amount Due (₹, Optional)
                  </label>
                  <input
                    type="number"
                    name="minimum_due_rupees"
                    step="0.01"
                    min="0"
                    value={stmtMinDue}
                    onChange={(e) => setStmtMinDue(e.target.value)}
                    placeholder="e.g. 750.00"
                    className={`${inputClass} font-semibold tabular-nums`}
                  />
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Defaults to 5% or ₹500 if blank.
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Notes / Breakdown (Optional)
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  maxLength={500}
                  value={stmtNotes}
                  onChange={(e) => setStmtNotes(e.target.value)}
                  placeholder="e.g. Includes ₹5,000 EMI conversion installment & GST"
                  className={inputClass}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStatementModal(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10 cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={!stmtCardId || !stmtBalance}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-6 py-2.5 text-xs font-bold text-slate-950 shadow-lg hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Save Statement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
