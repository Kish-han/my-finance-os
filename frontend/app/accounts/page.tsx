import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAccount } from "./actions";
import { logout } from "../login/actions";
import {
  Landmark,
  Wallet,
  Plus,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";

type AccountsPageProps = {
  searchParams: Promise<{
    error?: string;
    created?: string;
  }>;
};

function formatRupees(paise: number | string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(paise) / 100);
}

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

async function AccountsContent({
  searchParams,
}: AccountsPageProps) {
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
  const userEmail = user.email || "Private Client";
  const displayName = resolveDisplayName(user);

  const { data: accounts, error: accountsError } = await supabase
    .from("accounts")
    .select(
      "id, name, account_type, institution, opening_balance_paise, opening_balance_date, currency_code"
    )
    .eq("user_id", userId)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  const messages: Record<string, string> = {
    "invalid-input":
      "Check your entries. The balance must be a valid amount.",
    "save-failed":
      "We couldn't save the account. Please try again.",
  };

  const totalLiquidPaise = (accounts ?? []).reduce(
    (total, account) => total + Number(account.opening_balance_paise || 0),
    0
  );

  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3]">
      {/* Obsidian Wealth ambient atmospheric lighting */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-[#10b981]/10 blur-[150px] animate-pulse-glow" />
      <div className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/10 blur-[160px] animate-pulse-glow" style={{ animationDelay: "2s" }} />

      {/* Stitch Executive Header */}
      <AuraHeader
        sectionTitle="Accounts & Reserves"
        userEmail={userEmail}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 space-y-6">
        {/* Navigation context pill */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 shrink-0 rounded-full bg-[#4edea3] animate-pulse" />
            <h1 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Institutional Liquid Reserves
            </h1>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-widest text-[#4edea3]">
            INR · VERIFIED
          </span>
        </div>

        {/* Notifications */}
        {params.created === "1" && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 px-5 py-4 text-xs sm:text-sm font-semibold text-emerald-300 shadow-xl backdrop-blur-xl"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
              <Zap className="h-4 w-4" />
            </div>
            <p>Account saved successfully. Initial balance is available for liquidity tracking.</p>
          </div>
        )}

        {params.error && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm font-semibold text-rose-300 backdrop-blur-xl"
          >
            {messages[params.error] ?? "Something went wrong."}
          </div>
        )}

        {accountsError && (
          <div
            role="alert"
            className="rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-sm font-semibold text-rose-300 backdrop-blur-xl"
          >
            We couldn&apos;t load your accounts. Check your database connection and try again.
          </div>
        )}

        {/* Hero Liquid Reserves Card */}
        <section className="aura-card-obsidian relative overflow-hidden rounded-[2.5rem] p-7 sm:p-9 shadow-2xl backdrop-blur-2xl">
          <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#10b981]/15 blur-3xl" />
          <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-[#8b5cf6]/10 blur-3xl" />

          <div className="relative z-10 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-[#4edea3] animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#4edea3]">
                Total Opening Liquid Reserves
              </span>
            </div>

            <div className="text-4xl sm:text-6xl font-black tracking-tight text-white tabular-nums drop-shadow-md">
              {formatRupees(totalLiquidPaise)}
            </div>

            <p className="text-xs sm:text-sm text-slate-400 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#4edea3]" />
              <span>{(accounts ?? []).length} registered accounts and wallets</span>
            </p>
          </div>
        </section>

        {/* Add Account Module with Aura Panel Glass Form */}
        <section className="aura-panel p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#10b981]/15 text-[#4edea3] border border-[#10b981]/30">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Add an Account or Wallet
              </h2>
              <p className="text-xs text-slate-400">
                Record a bank savings/checking account or cash reserve and its starting balance.
              </p>
            </div>
          </div>

          <form action={createAccount} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="name"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Account name
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  maxLength={80}
                  placeholder="e.g. Primary Savings, Daily Cash"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-[#4edea3] focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="accountType"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Account type
                </label>
                <select
                  id="accountType"
                  name="accountType"
                  required
                  defaultValue="bank"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-[#4edea3] focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                >
                  <option value="bank" className="bg-slate-900 text-white">
                    Bank Account
                  </option>
                  <option value="cash" className="bg-slate-900 text-white">
                    Cash Wallet
                  </option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label
                  htmlFor="institution"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Institution (optional)
                </label>
                <input
                  id="institution"
                  name="institution"
                  maxLength={100}
                  placeholder="e.g. HDFC Bank, ICICI Bank"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-[#4edea3] focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="openingBalance"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Opening balance (₹)
                </label>
                <input
                  id="openingBalance"
                  name="openingBalance"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  required
                  defaultValue="0"
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold tabular-nums text-white placeholder:text-slate-500 outline-none transition-all focus:border-[#4edea3] focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                />
              </div>

              <div>
                <label
                  htmlFor="openingBalanceDate"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Balance as of date
                </label>
                <input
                  id="openingBalanceDate"
                  name="openingBalanceDate"
                  type="date"
                  required
                  defaultValue={indiaToday()}
                  max={indiaToday()}
                  className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-[#4edea3] focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full rounded-2xl bg-gradient-to-r from-[#4edea3] via-[#10b981] to-[#003824] py-3.5 text-sm font-bold text-[#003824] shadow-xl shadow-emerald-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
            >
              Save Account
            </button>
          </form>
        </section>

        {/* Saved Accounts List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-2 w-2 rounded-full bg-[#4edea3] animate-pulse" />
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-white">
                Registered Accounts ({(accounts ?? []).length})
              </h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              LIQUID VAULT
            </span>
          </div>

          {!accounts?.length ? (
            <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center backdrop-blur-md">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-[#4edea3] ring-1 ring-emerald-500/30">
                <Landmark className="h-7 w-7" />
              </div>
              <h3 className="mt-4 text-base font-bold text-white">No accounts registered yet</h3>
              <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                Add your bank accounts and cash reserves above to track liquid capital and pay EMIs.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {accounts.map((account) => {
                const isBank = account.account_type === "bank";

                return (
                  <article
                    key={account.id}
                    className="aura-panel group relative overflow-hidden p-5 transition-all duration-300 hover:scale-[1.01] hover:border-[#4edea3]/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                            isBank
                              ? "bg-[#10b981]/15 text-[#4edea3] border border-[#10b981]/30"
                              : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {isBank ? (
                            <Landmark className="h-5 w-5" />
                          ) : (
                            <Wallet className="h-5 w-5" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <h3 className="truncate text-base font-bold text-white group-hover:text-[#4edea3] transition-colors">
                            {account.name}
                          </h3>
                          <p className="mt-0.5 truncate text-xs text-slate-400">
                            {account.institution || "Personal wallet"}
                          </p>
                        </div>
                      </div>

                      <Badge
                        variant={isBank ? "emerald" : "amber"}
                        className="text-[10px] uppercase font-bold tracking-wider"
                      >
                        {isBank ? "Bank" : "Cash"}
                      </Badge>
                    </div>

                    <div className="mt-5 border-t border-white/10 pt-4 flex items-end justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Opening Balance
                        </span>
                        <div className="text-xl sm:text-2xl font-black tracking-tight text-white tabular-nums">
                          {formatRupees(account.opening_balance_paise)}
                        </div>
                      </div>

                      <span className="text-[10px] text-slate-500">
                        Since {account.opening_balance_date}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Footer */}
        <p className="pt-4 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Private financial telemetry. Calculations computed from verified database records.
        </p>
      </div>

      {/* Stitch Floating Dock */}
      <AuraBottomNav />
    </main>
  );
}

export default function AccountsPage({
  searchParams,
}: AccountsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#10141a] p-6 text-slate-400">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4edea3] border-t-transparent" />
            <p className="text-sm font-mono tracking-wider text-slate-300">
              Loading your accounts...
            </p>
          </div>
        </main>
      }
    >
      <AccountsContent searchParams={searchParams} />
    </Suspense>
  );
}
