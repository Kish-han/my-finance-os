"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Percent, Calendar, Receipt, AlertCircle } from "lucide-react";

export function EmiSubNav() {
  const pathname = usePathname();

  const isSchedule = pathname?.startsWith("/emi/schedule");
  const isForeclosure = pathname?.startsWith("/emi/foreclosure");
  const isPayments = pathname?.startsWith("/emi/payments");
  const isOverview = pathname === "/emi" || pathname === "/emi/";

  return (
    <nav className="mx-auto max-w-5xl px-4 sm:px-6 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#181c22]/80 px-4 py-2.5 backdrop-blur-xl shadow-xl">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
            <Percent className="h-3.5 w-3.5 shrink-0" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">
            Loan Management & Amortization
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs font-semibold">
          <Link
            href="/emi"
            className={`rounded-xl px-3 py-1.5 transition-all ${
              isOverview
                ? "text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 shadow-sm font-bold"
                : "text-slate-300 hover:text-white hover:bg-white/10 border border-transparent"
            }`}
          >
            Loans Overview
          </Link>

          <Link
            href="/emi/schedule"
            className={`rounded-xl px-3 py-1.5 transition-all inline-flex items-center gap-1.5 ${
              isSchedule
                ? "text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 shadow-sm font-bold"
                : "text-slate-300 hover:text-white hover:bg-white/10 border border-transparent"
            }`}
          >
            <Calendar className="h-3 w-3 shrink-0" />
            <span>Repayment Schedule</span>
          </Link>

          <Link
            href="/emi/foreclosure"
            className={`rounded-xl px-3 py-1.5 transition-all inline-flex items-center gap-1.5 ${
              isForeclosure
                ? "text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 shadow-sm font-bold"
                : "text-slate-300 hover:text-white hover:bg-white/10 border border-transparent"
            }`}
          >
            <AlertCircle className="h-3 w-3 shrink-0" />
            <span>Foreclose Loan</span>
          </Link>

          <Link
            href="/emi/payments"
            className={`rounded-xl px-3 py-1.5 transition-all inline-flex items-center gap-1.5 ${
              isPayments
                ? "text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 shadow-sm font-bold"
                : "text-slate-300 hover:text-white hover:bg-white/10 border border-transparent"
            }`}
          >
            <Receipt className="h-3 w-3 shrink-0" />
            <span>Record Payment</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
