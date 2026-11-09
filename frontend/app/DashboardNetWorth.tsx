"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Eye,
  EyeOff,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LiquidGlassOrb } from "@/components/LiquidGlassOrb";

interface DashboardNetWorthProps {
  netWorthPaise: number;
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
  availableBalancePaise?: number;
  personalReceivablesPaise?: number;
  personalPayablesPaise?: number;
  canCalculate: boolean;
  accountsCount: number;
  cardsCount: number;
  debtsCount: number;
  userEmail: string;
  displayName?: string;
}

function formatRupees(paise: number | string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(paise) / 100);
}

export function DashboardNetWorth({
  netWorthPaise,
  totalAssetsPaise,
  totalLiabilitiesPaise,
  availableBalancePaise = totalAssetsPaise,
  personalReceivablesPaise = 0,
  personalPayablesPaise = 0,
  canCalculate,
  accountsCount,
  cardsCount,
  debtsCount,
  userEmail,
  displayName,
}: DashboardNetWorthProps) {
  const [isMasked, setIsMasked] = useState(false);

  const clientName = (
    displayName && displayName !== "User"
      ? displayName
      : userEmail.split("@")[0] || "PRIVATE CLIENT"
  ).toUpperCase();
  const isPositive = netWorthPaise >= 0;

  // Debt-to-Asset ratio calculation
  const debtToAssetPct =
    totalAssetsPaise > 0
      ? Math.round((totalLiabilitiesPaise / totalAssetsPaise) * 100)
      : totalLiabilitiesPaise > 0
      ? 100
      : 0;

  return (
    <section className="aura-card-obsidian relative overflow-hidden rounded-[2.5rem] p-6 sm:p-9 shadow-2xl backdrop-blur-2xl">
      {/* 3D Liquid Glass Interactive Refraction Orb */}
      <div className="pointer-events-none absolute -right-6 -top-6 sm:right-6 sm:top-6 opacity-85 z-0">
        <LiquidGlassOrb size={210} />
      </div>

      <div className="relative z-10 space-y-6">
        {/* Top telemetry bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#4edea3] animate-pulse shadow-[0_0_10px_#4edea3]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--foreground)] font-mono">
              ESTIMATED TOTAL NET WORTH
            </span>
            <Badge
              variant="emerald"
              className="text-[10px] uppercase font-bold tracking-widest py-0.5 px-2"
            >
              AUDITED VAULT
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMasked(!isMasked)}
              className="flex items-center gap-1.5 rounded-full bg-slate-200/80 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 border border-slate-300/80 dark:border-white/15 px-3 py-1.5 text-xs text-[var(--foreground)] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] dark:focus-visible:ring-[#4edea3]"
              title={isMasked ? "Reveal figures" : "Mask figures"}
            >
              {isMasked ? (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Show</span>
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Hide</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Hero net worth value */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div
              className={`text-4xl sm:text-6xl md:text-7xl font-black tracking-tight tabular-nums drop-shadow-md ${
                !canCalculate
                  ? "text-[var(--foreground-muted)]"
                  : isPositive
                  ? "text-[var(--foreground)]"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {isMasked
                ? "••••••••••"
                : canCalculate
                ? formatRupees(netWorthPaise)
                : "Unavailable"}
            </div>
            <p className="mt-2 text-xs sm:text-sm text-[var(--foreground-muted)] flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-[#4edea3] shrink-0" />
              <span>
                Computed across {accountsCount} accounts, {cardsCount} credit cards, and {debtsCount} active loans for {clientName}.
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <Link
              href="/accounts"
              className="rounded-full bg-slate-200/80 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 border border-slate-300/80 dark:border-white/15 px-4 py-2 text-xs font-bold text-[var(--foreground)] transition-all shadow-sm flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] dark:focus-visible:ring-[#4edea3]"
            >
              <span>Accounts</span>
              <Landmark className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/transactions/new"
              className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-500 dark:to-teal-500 px-4 py-2 text-xs font-bold text-white dark:text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] dark:focus-visible:ring-[#4edea3]"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>New Entry</span>
            </Link>
          </div>
        </div>

        {/* 3-Column Assets vs Liabilities vs Available Runway Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 border-t border-[var(--surface-card-border)] pt-5">
          {/* 1. Liquid Assets Card */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 sm:p-5 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/40 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-[#4edea3] flex items-center justify-center">
                  <ArrowDownLeft className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Total Assets
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase text-[var(--foreground-subtle)]">
                {accountsCount} ACCOUNTS
              </span>
            </div>
            <div className="mt-2.5">
              <p className="text-xl sm:text-2xl font-black text-[var(--foreground)] tabular-nums drop-shadow-sm">
                {isMasked
                  ? "••••••••"
                  : canCalculate
                  ? formatRupees(totalAssetsPaise)
                  : "Unavailable"}
              </p>
              <p className="mt-1 text-xs text-[var(--foreground-muted)] font-medium">
                Verified liquid bank accounts & cash reserves
              </p>
              {personalReceivablesPaise > 0 && (
                <span className="text-[10px] text-emerald-600 dark:text-[#4edea3] font-mono block mt-0.5">
                  + ₹{(personalReceivablesPaise / 100).toLocaleString("en-IN")} personal receivables
                </span>
              )}
            </div>
          </div>

          {/* 2. Total Liabilities Card */}
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 sm:p-5 backdrop-blur-md relative overflow-hidden group hover:border-rose-500/40 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-rose-500/20 text-rose-700 dark:text-rose-400 flex items-center justify-center">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                  Total Liabilities
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase text-[var(--foreground-subtle)]">
                {cardsCount} CARDS · {debtsCount} LOANS
              </span>
            </div>
            <div className="mt-2.5">
              <p className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums drop-shadow-sm">
                {isMasked
                  ? "••••••••"
                  : canCalculate
                  ? formatRupees(totalLiabilitiesPaise)
                  : "Unavailable"}
              </p>
              <p className="mt-1 text-xs text-[var(--foreground-muted)] font-medium">
                Revolving card dues + term loan principal
              </p>
              {personalPayablesPaise > 0 && (
                <span className="text-[10px] text-rose-600 dark:text-rose-400 font-mono block mt-0.5">
                  + ₹{(personalPayablesPaise / 100).toLocaleString("en-IN")} personal borrowing
                </span>
              )}
            </div>
          </div>

          {/* 3. Available Balance & Solvency Health */}
          <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 sm:p-5 backdrop-blur-md relative overflow-hidden group hover:border-cyan-500/40 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 flex items-center justify-center">
                  <Wallet className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-700 dark:text-cyan-400">
                  Available Balance
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase text-[var(--foreground-subtle)]">
                {debtToAssetPct}% DEBT RATIO
              </span>
            </div>
            <div className="mt-2.5">
              <p className="text-xl sm:text-2xl font-black text-cyan-700 dark:text-cyan-300 tabular-nums drop-shadow-sm">
                {isMasked
                  ? "••••••••"
                  : canCalculate
                  ? formatRupees(availableBalancePaise)
                  : "Unavailable"}
              </p>
              <p className="mt-1 text-xs text-[var(--foreground-muted)] font-medium">
                Immediately deployable liquid capital
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
