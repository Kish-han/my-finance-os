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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface DashboardNetWorthProps {
  netWorthPaise: number;
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
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
  canCalculate,
  accountsCount,
  cardsCount,
  debtsCount,
  userEmail,
  displayName,
}: DashboardNetWorthProps) {
  const [isMasked, setIsMasked] = useState(false);

  const clientName =
    (displayName && displayName !== "User"
      ? displayName
      : userEmail.split("@")[0] || "PRIVATE CLIENT"
    ).toUpperCase();
  const isPositive = netWorthPaise >= 0;

  return (
    <section className="aura-card-obsidian relative overflow-hidden rounded-[2.5rem] p-5 sm:p-9 shadow-2xl backdrop-blur-2xl border border-white/10">
      {/* Ambient specular light flares */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/15 blur-3xl animate-pulse-glow" />
      <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl animate-pulse-glow" />

      <div className="relative z-10 space-y-6">
        {/* Top telemetry bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-[#4edea3] animate-pulse shadow-[0_0_10px_#4edea3]" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 font-mono">
              ESTIMATED TOTAL NET WORTH
            </span>
            <Badge
              variant="outline"
              className="text-[10px] uppercase font-bold tracking-widest border-emerald-500/30 text-emerald-400 bg-emerald-500/10 py-0.5 px-2"
            >
              AUDITED VAULT
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMasked(!isMasked)}
              className="flex items-center gap-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 text-xs text-slate-300 hover:text-white transition-all cursor-pointer"
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
                  ? "text-slate-400"
                  : isPositive
                  ? "text-white"
                  : "text-rose-400"
              }`}
            >
              {isMasked
                ? "••••••••••"
                : canCalculate
                ? formatRupees(netWorthPaise)
                : "Unavailable"}
            </div>
            <p className="mt-2 text-xs sm:text-sm text-slate-400 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>
                Computed across {accountsCount} accounts, {cardsCount} credit cards, and {debtsCount} active loans for {clientName}.
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <Link
              href="/accounts"
              className="rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-xs font-bold text-white transition-all shadow-sm flex items-center gap-1.5"
            >
              <span>Accounts</span>
              <Landmark className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/transactions"
              className="rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 transition-all flex items-center gap-1.5"
            >
              <TrendingUp className="h-3.5 w-3.5" />
              <span>New Entry</span>
            </Link>
          </div>
        </div>

        {/* Dual Assets vs Liabilities Breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 border-t border-white/10 pt-5">
          {/* Liquid Assets Card */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 sm:p-5 backdrop-blur-md relative overflow-hidden group hover:border-emerald-500/40 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ArrowDownLeft className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300">
                  Total Liquid Assets
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase text-emerald-400/80">
                {accountsCount} ACCOUNTS
              </span>
            </div>
            <div className="mt-2.5">
              <p className="text-2xl sm:text-3xl font-black text-white tabular-nums drop-shadow-sm">
                {isMasked
                  ? "••••••••"
                  : canCalculate
                  ? formatRupees(totalAssetsPaise)
                  : "Unavailable"}
              </p>
              <p className="mt-1 text-xs text-emerald-400/90 font-medium">
                Verified liquid bank accounts & cash reserves
              </p>
            </div>
          </div>

          {/* Total Liabilities Card */}
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 sm:p-5 backdrop-blur-md relative overflow-hidden group hover:border-rose-500/40 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                  Total Liabilities
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase text-rose-400/80">
                {cardsCount} CARDS · {debtsCount} LOANS
              </span>
            </div>
            <div className="mt-2.5">
              <p className="text-2xl sm:text-3xl font-black text-rose-200 tabular-nums drop-shadow-sm">
                {isMasked
                  ? "••••••••"
                  : canCalculate
                  ? formatRupees(totalLiabilitiesPaise)
                  : "Unavailable"}
              </p>
              <p className="mt-1 text-xs text-rose-300/80 font-medium">
                Revolving card balances + active loan principal
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
