"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CreditCard,
  ArrowLeftRight,
  TrendingUp,
  Landmark,
  LogOut,
  User,
  Plus,
} from "lucide-react";

interface AuraHeaderProps {
  sectionTitle?: string;
  userEmail?: string | null;
  displayName?: string | null;
  signOutAction?: () => Promise<void>;
}

export function AuraHeader({
  sectionTitle = "Vault",
  userEmail,
  displayName,
  signOutAction,
}: AuraHeaderProps) {
  const pathname = usePathname();

  const isDashboard = pathname === "/";
  const isTransactions = pathname?.startsWith("/transactions");
  const isCards = pathname?.startsWith("/cards");
  const isLoans = pathname?.startsWith("/emi");
  const isAccounts = pathname?.startsWith("/accounts");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#10141a]/80 backdrop-blur-xl border-b border-white/[0.08] shadow-[0_1px_8px_rgba(0,0,0,0.25)]">
      <div className="h-16 max-w-5xl mx-auto px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
        {/* Brand Monogram & Section Identity */}
        <Link href="/" className="flex items-center gap-2 sm:gap-3 group shrink min-w-0">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4edea3] via-[#10b981] to-[#003824] text-[#003824] font-black text-sm sm:text-base shadow-md shadow-emerald-500/25 ring-1 ring-white/40 group-hover:scale-105 transition-transform">
            A
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <span className="text-xs sm:text-base font-black tracking-tight text-white group-hover:text-[#4edea3] transition-colors whitespace-nowrap">
                AURA Wealth
              </span>
              <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-[#4edea3] animate-pulse" />
            </div>
            <span className="text-[10px] sm:text-[11px] font-medium tracking-wide text-[#bbcabf] truncate leading-tight">
              {sectionTitle}
            </span>
          </div>
        </Link>

        {/* Visible Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 bg-white/[0.03] border border-white/10 px-2 py-1 rounded-full backdrop-blur-md shrink-0">
          <Link
            href="/"
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              isDashboard
                ? "bg-[#4edea3] text-slate-950 font-black shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-white/10 font-medium"
            }`}
          >
            Vault
          </Link>
          <Link
            href="/transactions"
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              isTransactions
                ? "bg-[#4edea3] text-slate-950 font-black shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-white/10 font-medium"
            }`}
          >
            Transactions
          </Link>
          <Link
            href="/cards"
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              isCards
                ? "bg-[#4edea3] text-slate-950 font-black shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-white/10 font-medium"
            }`}
          >
            Cards
          </Link>
          <Link
            href="/emi"
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              isLoans
                ? "bg-[#4edea3] text-slate-950 font-black shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-white/10 font-medium"
            }`}
          >
            Loans
          </Link>
          <Link
            href="/accounts"
            className={`px-3 py-1 rounded-full text-xs transition-all ${
              isAccounts
                ? "bg-[#4edea3] text-slate-950 font-black shadow-sm"
                : "text-slate-300 hover:text-white hover:bg-white/10 font-medium"
            }`}
          >
            Accounts
          </Link>
        </nav>

        {/* Private Client Status Pill, Add Transaction Shortcut & User Badges */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          <Link
            href="/transactions/new"
            title="Record New Transaction"
            className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
              pathname === "/transactions/new"
                ? "bg-white text-slate-950 font-black shadow-md"
                : "bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20 hover:brightness-110 active:scale-95"
            } h-8 px-2 sm:h-auto sm:px-3 sm:py-1.5`}
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5] shrink-0" />
            <span className="hidden sm:inline">Add Transaction</span>
            <span className="hidden min-[360px]:inline sm:hidden">Add</span>
          </Link>

          {/* Profile & Settings Button: Combined & responsive to guarantee zero clipping */}
          <Link
            href="/profile"
            title={userEmail ? `Signed in as ${userEmail} · Open Settings` : "Profile & Settings"}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-1 h-8 rounded-full bg-[#262a31]/80 hover:bg-[#31353c] border border-white/[0.08] hover:border-emerald-500/40 backdrop-blur-md transition-all group cursor-pointer shrink-0"
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4edea3] opacity-75 shrink-0" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#4edea3] shrink-0" />
            </span>
            <span className="hidden sm:inline text-[10px] font-bold tracking-wider text-[#4edea3] group-hover:text-white uppercase transition-colors truncate max-w-[140px]">
              {displayName || "Private Client"}
            </span>
            <User className="h-3.5 w-3.5 text-[#bbcabf] group-hover:text-white transition-colors shrink-0" />
          </Link>

          {signOutAction ? (
            <form action={signOutAction} className="shrink-0 flex items-center">
              <button
                type="submit"
                title="Sign Out / Switch Session"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-[#bbcabf] hover:text-white hover:bg-white/10 hover:border-white/20 transition-all cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              title="Sign Out / Switch Session"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 border border-white/10 text-[#bbcabf] hover:text-white hover:bg-white/10 hover:border-white/20 transition-all"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

export function AuraBottomNav() {
  const pathname = usePathname();

  const isVault = pathname === "/";
  const isCards = pathname?.startsWith("/cards");
  const isTransfers = pathname?.startsWith("/transactions");
  const isGrowth = pathname?.startsWith("/emi");
  const isAccounts = pathname?.startsWith("/accounts");

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none pb-4 sm:pb-5">
      <div className="max-w-md mx-auto px-4">
        <div className="pointer-events-auto h-16 w-full rounded-full aura-dock flex items-center justify-around px-2 relative">
          {/* Item 1: Vault (Dashboard) */}
          <Link
            href="/"
            className={`flex flex-col items-center justify-center shrink-0 min-w-[48px] min-h-[44px] px-2 transition-colors ${
              isVault ? "text-[#4edea3] font-bold" : "text-[#bbcabf] hover:text-[#dfe2eb]"
            }`}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0" />
            <span className="text-[10px] mt-0.5 tracking-wide">Vault</span>
          </Link>

          {/* Item 2: Cards */}
          <Link
            href="/cards"
            className={`flex flex-col items-center justify-center shrink-0 min-w-[48px] min-h-[44px] px-2 transition-colors ${
              isCards ? "text-[#4edea3] font-bold" : "text-[#bbcabf] hover:text-[#dfe2eb]"
            }`}
          >
            <CreditCard className="h-5 w-5 shrink-0" />
            <span className="text-[10px] mt-0.5 tracking-wide">Cards</span>
          </Link>

          {/* Item 3: Center Elevated Action Button (Transactions & Ledger) */}
          <div className="relative -top-2 shrink-0 flex flex-col items-center">
            <Link
              href="/transactions"
              className={`flex items-center justify-center w-11 h-11 shrink-0 rounded-full transition-transform active:scale-95 hover:scale-105 ${
                isTransfers
                  ? "bg-white text-[#003824] ring-2 ring-[#4edea3] shadow-[0_8px_24px_-4px_rgba(255,255,255,0.6)]"
                  : "bg-[#4edea3] text-[#003824] shadow-[0_8px_24px_-4px_rgba(78,222,163,0.5)]"
              }`}
              title="Transactions & Ledger"
            >
              <ArrowLeftRight className="h-5 w-5 stroke-[2.5] shrink-0" />
            </Link>
            <span
              className={`text-[9px] mt-0.5 tracking-tight font-semibold ${
                isTransfers ? "text-[#4edea3] font-bold" : "text-[#bbcabf]"
              }`}
            >
              Transactions
            </span>
          </div>

          {/* Item 4: Growth & Loans */}
          <Link
            href="/emi"
            className={`flex flex-col items-center justify-center shrink-0 min-w-[48px] min-h-[44px] px-2 transition-colors ${
              isGrowth ? "text-[#4edea3] font-bold" : "text-[#bbcabf] hover:text-[#dfe2eb]"
            }`}
          >
            <TrendingUp className="h-5 w-5 shrink-0" />
            <span className="text-[10px] mt-0.5 tracking-wide">Loans</span>
          </Link>

          {/* Item 5: Accounts & Liquidity */}
          <Link
            href="/accounts"
            className={`flex flex-col items-center justify-center shrink-0 min-w-[48px] min-h-[44px] px-2 transition-colors ${
              isAccounts ? "text-[#4edea3] font-bold" : "text-[#bbcabf] hover:text-[#dfe2eb]"
            }`}
          >
            <Landmark className="h-5 w-5 shrink-0" />
            <span className="text-[10px] mt-0.5 tracking-wide">Accounts</span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
