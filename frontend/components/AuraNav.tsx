"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CreditCard,
  ArrowLeftRight,
  CalendarClock,
  PieChart,
  Landmark,
  LogOut,
  User,
  Plus,
  MoreHorizontal,
  X,
  ChevronRight,
  Percent,
  Handshake,
} from "lucide-react";
import { ThemeToggle } from "./ThemeProvider";
import { logout } from "@/app/login/actions";

interface AuraNavProps {
  sectionTitle?: string;
  userEmail?: string | null;
  displayName?: string | null;
  signOutAction?: () => Promise<void>;
}

export function getAuraNavActiveState(pathname: string | null) {
  const isDashboard = pathname === "/";
  const isBudgets = Boolean(pathname?.startsWith("/budgets"));
  const isRecurring = Boolean(pathname?.startsWith("/transactions/recurring"));
  const isTransactions = Boolean(pathname?.startsWith("/transactions")) && !isRecurring;
  const isCards = Boolean(pathname?.startsWith("/cards"));
  const isLoans = Boolean(pathname?.startsWith("/emi"));
  const isAccounts = Boolean(pathname?.startsWith("/accounts"));
  const isMoneyTracker = Boolean(pathname?.startsWith("/money-tracker"));

  return {
    isDashboard,
    isVault: isDashboard,
    isBudgets,
    isRecurring,
    isTransactions,
    isCards,
    isLoans,
    isAccounts,
    isMoneyTracker,
  };
}

/* =========================================================
   1. DESKTOP EXECUTIVE SIDEBAR (lg:flex)
========================================================= */
export function AuraSidebar({
  userEmail,
  displayName,
  signOutAction,
}: AuraNavProps) {
  const pathname = usePathname();
  const { isDashboard, isTransactions, isBudgets, isRecurring, isCards, isLoans, isAccounts, isMoneyTracker } =
    getAuraNavActiveState(pathname);

  const coreNav = [
    {
      href: "/",
      label: "Wealth Overview",
      shortLabel: "Overview",
      icon: LayoutDashboard,
      active: isDashboard,
    },
    {
      href: "/transactions",
      label: "Transactions Ledger",
      shortLabel: "Transactions",
      icon: ArrowLeftRight,
      active: isTransactions,
    },
    {
      href: "/budgets",
      label: "Budgets & Alerts",
      shortLabel: "Budgets",
      icon: PieChart,
      active: isBudgets,
    },
    {
      href: "/transactions/recurring",
      label: "Recurring Rules",
      shortLabel: "Recurring",
      icon: CalendarClock,
      active: isRecurring,
    },
  ];

  const capitalNav = [
    {
      href: "/money-tracker",
      label: "Money Tracker",
      shortLabel: "Money Tracker",
      icon: Handshake,
      active: isMoneyTracker,
    },
    {
      href: "/cards",
      label: "Credit Cards & Lines",
      shortLabel: "Cards",
      icon: CreditCard,
      active: isCards,
    },
    {
      href: "/emi",
      label: "Loans & Amortization",
      shortLabel: "Loans",
      icon: Percent,
      active: isLoans,
    },
    {
      href: "/accounts",
      label: "Accounts & Reserves",
      shortLabel: "Accounts",
      icon: Landmark,
      active: isAccounts,
    },
  ];

  return (
    <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-64 z-40 aura-sidebar flex-col justify-between p-5 select-none">
      {/* Brand & Monogram Header */}
      <div className="space-y-6">
        <Link
          href="/"
          className="flex items-center gap-3 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4edea3] rounded-2xl p-1"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4edea3] via-[#10b981] to-[#003824] text-[#003824] font-black text-lg shadow-lg shadow-emerald-500/25 ring-1 ring-white/40 group-hover:scale-105 transition-all">
            A
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-black tracking-tight text-[var(--foreground)] group-hover:text-[#4edea3] transition-colors">
                AURA Wealth
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse" />
            </div>
            <span className="text-[10px] font-mono tracking-widest uppercase text-[var(--foreground-subtle)] font-medium">
              PRIVATE CLIENT OS
            </span>
          </div>
        </Link>

        {/* Quick Transaction Action */}
        <Link
          href="/transactions/new"
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 active:scale-[0.98] transition-all cursor-pointer"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          <span>Add Transaction</span>
        </Link>

        {/* Navigation Group 1: Core Wealth */}
        <div className="space-y-1">
          <span className="px-3 text-[10px] font-mono font-bold tracking-widest uppercase text-[var(--foreground-subtle)] block pb-1">
            CORE WEALTH
          </span>
          {coreNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all group ${
                  item.active
                    ? "bg-emerald-500/10 dark:bg-[#10b981]/15 text-emerald-800 dark:text-[#4edea3] font-bold border border-emerald-500/25 dark:border-[#10b981]/30 shadow-sm"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-slate-200/50 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${
                      item.active ? "text-emerald-700 dark:text-[#4edea3] stroke-[2.2]" : "text-[var(--foreground-subtle)]"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.active && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-[#4edea3] shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Navigation Group 2: Capital & Liabilities */}
        <div className="space-y-1">
          <span className="px-3 text-[10px] font-mono font-bold tracking-widest uppercase text-[var(--foreground-subtle)] block pb-1">
            CAPITAL & DEBT
          </span>
          {capitalNav.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all group ${
                  item.active
                    ? "bg-emerald-500/10 dark:bg-[#10b981]/15 text-emerald-800 dark:text-[#4edea3] font-bold border border-emerald-500/25 dark:border-[#10b981]/30 shadow-sm"
                    : "text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-slate-200/50 dark:hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-transform group-hover:scale-110 ${
                      item.active ? "text-emerald-700 dark:text-[#4edea3] stroke-[2.2]" : "text-[var(--foreground-subtle)]"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.active && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-[#4edea3] shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bottom Profile & Controls */}
      <div className="space-y-3 pt-4 border-t border-[var(--surface-panel-border)]">
        {/* Theme Switcher Bar */}
        <div className="flex items-center justify-between px-2">
          <span className="text-[11px] font-medium text-[var(--foreground-muted)]">Appearance</span>
          <ThemeToggle compact />
        </div>

        {/* User Card */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/[0.06]">
          <Link
            href="/profile"
            className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition-opacity"
            title="Account Settings"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 dark:bg-[#262a31] border border-emerald-500/20 dark:border-white/10 text-emerald-700 dark:text-emerald-400">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--foreground)] truncate">
                {displayName || "Private Client"}
              </p>
              <p className="text-[10px] text-[var(--foreground-subtle)] truncate">
                {userEmail || "Connected"}
              </p>
            </div>
          </Link>

          <form action={signOutAction || logout} className="shrink-0">
            <button
              type="submit"
              title="Sign out of AURA Wealth"
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-rose-500/15 text-[var(--foreground-subtle)] hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}

/* =========================================================
   2. CONTEXTUAL TOP BAR (Adaptive Mobile & Desktop Header)
========================================================= */
export function AuraHeader({
  sectionTitle = "Wealth Overview",
  userEmail,
  displayName,
  signOutAction,
  includeSidebar = true,
}: AuraNavProps & { includeSidebar?: boolean }) {
  return (
    <>
      {includeSidebar && (
        <AuraSidebar
          sectionTitle={sectionTitle}
          userEmail={userEmail}
          displayName={displayName}
          signOutAction={signOutAction}
        />
      )}
      <header className="fixed top-0 left-0 right-0 z-30 lg:pl-64 aura-panel border-b border-[var(--surface-panel-border)] pt-[env(safe-area-inset-top,0px)] transition-all">
      <div className="h-16 max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between gap-3 min-w-0">
        {/* Brand identity on Mobile / Breadcrumbs on Desktop */}
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="lg:hidden flex items-center gap-2 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4edea3] rounded-xl"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#4edea3] via-[#10b981] to-[#003824] text-[#003824] font-black text-sm shadow-md shadow-emerald-500/25 ring-1 ring-white/40">
              A
            </div>
            <span className="text-sm font-black tracking-tight text-[var(--foreground)] whitespace-nowrap">
              AURA
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-[var(--foreground-subtle)]">
            <Link href="/" className="hover:text-[var(--foreground)] transition-colors">
              AURA
            </Link>
            <span>/</span>
            <span className="text-[var(--foreground)] font-bold">{sectionTitle}</span>
          </div>

          <span className="lg:hidden text-xs font-bold text-[var(--foreground-muted)] truncate max-w-[140px] sm:max-w-none">
            {sectionTitle}
          </span>
        </div>

        {/* Tactical Actions & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 md:gap-3 shrink-0">
          <Link
            href="/transactions/transfer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-xs font-bold text-cyan-700 dark:text-cyan-300 hover:text-cyan-900 dark:hover:text-white transition-all cursor-pointer active:scale-95"
            title="Internal Transfer between accounts"
          >
            <ArrowLeftRight className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Transfer</span>
          </Link>

          <Link
            href="/transactions/new"
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 dark:from-emerald-500 dark:to-teal-500 text-white dark:text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/20 hover:brightness-110 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span className="hidden sm:inline">Add Transaction</span>
            <span className="sm:hidden">Add</span>
          </Link>

          {/* Theme Switcher Toggle */}
          <ThemeToggle compact />

          {/* User Profile Pill */}
          <Link
            href="/profile"
            title={userEmail ? `Signed in as ${userEmail} · Profile Settings` : "Profile Settings"}
            className="flex items-center justify-center h-8 w-8 rounded-xl bg-slate-200/80 dark:bg-white/[0.06] border border-slate-300/80 dark:border-white/10 text-[var(--foreground)] hover:border-emerald-500/40 transition-all cursor-pointer"
          >
            <User className="h-4 w-4" />
          </Link>

          {/* Quick Sign Out Action (hidden on mobile to preserve title space; available in drawer & profile) */}
          <form action={signOutAction || logout} className="shrink-0 hidden sm:block">
            <button
              type="submit"
              title="Sign out of AURA Wealth"
              className="flex items-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs font-bold transition-all cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </form>
        </div>
      </div>
    </header>
    </>
  );
}

/* =========================================================
   3. MOBILE FLOATING LIQUID GLASS DOCK (lg:hidden)
========================================================= */
export function AuraBottomNav({
  signOutAction,
}: {
  userEmail?: string | null;
  displayName?: string | null;
  signOutAction?: () => Promise<void>;
} = {}) {
  const pathname = usePathname();
  const { isVault, isTransactions, isBudgets, isCards, isLoans, isAccounts, isRecurring, isMoneyTracker } =
    getAuraNavActiveState(pathname);

  const [isMoreOpen, setIsMoreOpen] = useState(false);

  // 4 Primary Anchors + 1 "More" Trigger for pristine mobile touch ergonomics
  const primaryTabs = [
    {
      href: "/",
      label: "Vault",
      icon: LayoutDashboard,
      active: isVault,
    },
    {
      href: "/transactions",
      label: "Activity",
      icon: ArrowLeftRight,
      active: isTransactions,
    },
    {
      href: "/budgets",
      label: "Budgets",
      icon: PieChart,
      active: isBudgets,
    },
    {
      href: "/cards",
      label: "Cards",
      icon: CreditCard,
      active: isCards,
    },
  ];

  const isMoreActive = isLoans || isAccounts || isRecurring || isMoneyTracker;

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 pointer-events-none pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] px-3 sm:px-6">
        <div className="max-w-md mx-auto">
          <div className="pointer-events-auto h-16 w-full rounded-full aura-dock flex items-center justify-between px-2 sm:px-4 relative shadow-2xl">
            {primaryTabs.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={item.active ? "page" : undefined}
                  className={`flex flex-col items-center justify-center flex-1 min-w-[56px] min-h-[48px] py-1 rounded-2xl transition-all cursor-pointer active:scale-95 ${
                    item.active
                      ? "text-emerald-700 dark:text-[#4edea3] font-bold"
                      : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 transition-transform ${
                      item.active ? "stroke-[2.5] scale-105" : "stroke-[1.8]"
                    }`}
                  />
                  <span className="text-[10px] mt-0.5 tracking-tight font-medium leading-none">
                    {item.label}
                  </span>
                  {item.active ? (
                    <span className="w-1.5 h-1 rounded-full bg-emerald-600 dark:bg-[#4edea3] shadow-[0_0_6px_rgba(16,185,129,0.5)] mt-0.5" />
                  ) : (
                    <span className="w-1.5 h-1 mt-0.5 opacity-0" />
                  )}
                </Link>
              );
            })}

            {/* "More" Trigger for Loans, Accounts, Recurring & Settings */}
            <button
              type="button"
              onClick={() => setIsMoreOpen(!isMoreOpen)}
              aria-label="More navigation modules"
              className={`flex flex-col items-center justify-center flex-1 min-w-[56px] min-h-[48px] py-1 rounded-2xl transition-all cursor-pointer active:scale-95 ${
                isMoreActive
                  ? "text-emerald-700 dark:text-[#4edea3] font-bold"
                  : "text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <MoreHorizontal
                className={`h-5 w-5 shrink-0 transition-transform ${
                  isMoreActive ? "stroke-[2.5]" : "stroke-[1.8]"
                }`}
              />
              <span className="text-[10px] mt-0.5 tracking-tight font-medium leading-none">
                More
              </span>
              {isMoreActive ? (
                <span className="w-1.5 h-1 rounded-full bg-emerald-600 dark:bg-[#4edea3] shadow-[0_0_6px_rgba(16,185,129,0.5)] mt-0.5" />
              ) : (
                <span className="w-1.5 h-1 mt-0.5 opacity-0" />
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Slide-Up Liquid Glass Secondary Drawer for Mobile */}
      {isMoreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMoreOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative z-10 w-full max-w-lg mx-auto aura-card-obsidian rounded-t-[2.5rem] p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] border-t border-[var(--surface-panel-border)] shadow-2xl animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center justify-between pb-4 border-b border-[var(--surface-panel-border)]">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-[#4edea3] animate-pulse" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--foreground)]">
                  All Financial Modules
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200/80 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-slate-300 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-4">
              <Link
                href="/money-tracker"
                onClick={() => setIsMoreOpen(false)}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                  isMoneyTracker
                    ? "bg-emerald-500/10 dark:bg-[#10b981]/15 border-emerald-500/30 dark:border-[#10b981]/40 text-emerald-800 dark:text-[#4edea3]"
                    : "bg-slate-100/70 dark:bg-white/[0.04] border-slate-200/80 dark:border-white/10 text-[var(--foreground)] hover:bg-slate-200/70 dark:hover:bg-white/[0.08]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Handshake className="h-5 w-5 text-emerald-600 dark:text-[#4edea3]" />
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </div>
                <span className="text-xs font-bold">Money Tracker</span>
                <span className="text-[10px] text-[var(--foreground-subtle)]">Personal lending & debt</span>
              </Link>

              <Link
                href="/emi"
                onClick={() => setIsMoreOpen(false)}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                  isLoans
                    ? "bg-emerald-500/10 dark:bg-[#10b981]/15 border-emerald-500/30 dark:border-[#10b981]/40 text-emerald-800 dark:text-[#4edea3]"
                    : "bg-slate-100/70 dark:bg-white/[0.04] border-slate-200/80 dark:border-white/10 text-[var(--foreground)] hover:bg-slate-200/70 dark:hover:bg-white/[0.08]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Percent className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </div>
                <span className="text-xs font-bold">Loans & EMI</span>
                <span className="text-[10px] text-[var(--foreground-subtle)]">Amortization schedules</span>
              </Link>

              <Link
                href="/accounts"
                onClick={() => setIsMoreOpen(false)}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                  isAccounts
                    ? "bg-emerald-500/10 dark:bg-[#10b981]/15 border-emerald-500/30 dark:border-[#10b981]/40 text-emerald-800 dark:text-[#4edea3]"
                    : "bg-slate-100/70 dark:bg-white/[0.04] border-slate-200/80 dark:border-white/10 text-[var(--foreground)] hover:bg-slate-200/70 dark:hover:bg-white/[0.08]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Landmark className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </div>
                <span className="text-xs font-bold">Accounts</span>
                <span className="text-[10px] text-[var(--foreground-subtle)]">Bank & cash reserves</span>
              </Link>

              <Link
                href="/transactions/recurring"
                onClick={() => setIsMoreOpen(false)}
                className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-1.5 ${
                  isRecurring
                    ? "bg-emerald-500/10 dark:bg-[#10b981]/15 border-emerald-500/30 dark:border-[#10b981]/40 text-emerald-800 dark:text-[#4edea3]"
                    : "bg-slate-100/70 dark:bg-white/[0.04] border-slate-200/80 dark:border-white/10 text-[var(--foreground)] hover:bg-slate-200/70 dark:hover:bg-white/[0.08]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <CalendarClock className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </div>
                <span className="text-xs font-bold">Recurring</span>
                <span className="text-[10px] text-[var(--foreground-subtle)]">Schedules & alerts</span>
              </Link>

              <Link
                href="/transactions/transfer"
                onClick={() => setIsMoreOpen(false)}
                className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] hover:bg-slate-200/70 dark:hover:bg-white/[0.08] text-[var(--foreground)] transition-all flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between">
                  <ArrowLeftRight className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  <ChevronRight className="h-4 w-4 opacity-50" />
                </div>
                <span className="text-xs font-bold">Transfer</span>
                <span className="text-[10px] text-[var(--foreground-subtle)]">Atomic internal transfer</span>
              </Link>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--surface-panel-border)] space-y-3">
              <div className="flex items-center justify-between">
                <Link
                  href="/profile"
                  onClick={() => setIsMoreOpen(false)}
                  className="flex items-center gap-2 text-xs font-bold text-[var(--foreground)] hover:text-emerald-600 dark:hover:text-[#4edea3] transition-colors"
                >
                  <User className="h-4 w-4" />
                  <span>Account & Profile Settings</span>
                </Link>
                <ThemeToggle compact />
              </div>

              <form action={signOutAction || logout}>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/25 text-xs font-bold transition-all cursor-pointer"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign Out of AURA Wealth</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* =========================================================
   4. COMPOSITE NAVIGATION SHELL (Renders Sidebar + Header + Dock)
========================================================= */
export function AuraNavigationShell({
  sectionTitle,
  userEmail,
  displayName,
  signOutAction,
}: AuraNavProps) {
  return (
    <>
      <AuraSidebar
        sectionTitle={sectionTitle}
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={signOutAction}
      />
      <AuraHeader
        sectionTitle={sectionTitle}
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={signOutAction}
      />
      <AuraBottomNav />
    </>
  );
}
