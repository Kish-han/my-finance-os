import { Suspense } from "react";
import { login, signup } from "./actions";
import {
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

async function LoginContent({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  const errorMessages: Record<string, string> = {
    "missing-fields": "Enter both your email and password.",
    "password-too-short": "Use a password with at least 8 characters.",
    "sign-in-failed": "Sign-in failed. Check your details and try again.",
    "sign-up-failed": "We couldn't create your account. Please try again.",
    confirmation_failed:
      "Email confirmation failed. Please request a new confirmation email.",
  };

  const message =
    params.message === "check-email"
      ? "Account request received. Check your email for a confirmation link."
      : null;

  const errorMessage = params.error
    ? errorMessages[params.error]
    : null;

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#07090e] px-4 py-12 text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Dynamic ambient floating lighting */}
      <div className="pointer-events-none fixed -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-emerald-500/15 blur-[140px] animate-pulse-glow" />
      <div
        className="pointer-events-none fixed -bottom-40 -right-40 h-[32rem] w-[32rem] rounded-full bg-cyan-500/15 blur-[150px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[35rem] w-[35rem] rounded-full bg-amber-500/5 blur-[160px] animate-pulse-glow"
        style={{ animationDelay: "4s" }}
      />

      <section className="apple-panel relative z-10 w-full max-w-md p-8 sm:p-10 shadow-2xl cred-glow-emerald animate-float-slow">
        {/* Brand glyph */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-700 text-slate-950 font-black text-2xl shadow-xl shadow-emerald-500/30 ring-1 ring-white/50">
          A
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Badge variant="emerald" className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5">
            AURA Wealth
          </Badge>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
            <span>256-BIT ENCRYPTION</span>
          </div>
        </div>

        <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-white">
          Access AURA Wealth
        </h1>

        <p className="mt-2 text-xs sm:text-sm leading-relaxed text-slate-400">
          Sign in to access your financial telemetry, revolving credit portfolios and amortized EMI schedules.
        </p>

        {message && (
          <div
            role="status"
            className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-xs font-semibold text-emerald-300 backdrop-blur-md"
          >
            {message}
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="mt-5 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4 text-xs font-semibold text-rose-300 backdrop-blur-md"
          >
            {errorMessage}
          </div>
        )}

        <form className="mt-7 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
            >
              Email address
            </label>
            <div className="relative">
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-emerald-400 focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                minLength={8}
                required
                placeholder="At least 8 characters"
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none transition-all focus:border-emerald-400 focus:bg-white/10 focus:ring-4 focus:ring-emerald-400/20"
              />
            </div>
          </div>

          <button
            formAction={login}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 py-3.5 text-sm font-bold text-slate-950 shadow-xl shadow-emerald-500/20 transition-all hover:brightness-110 active:scale-[0.99] cursor-pointer"
          >
            Sign In
          </button>

          <button
            formAction={signup}
            className="w-full rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-slate-200 transition-all hover:bg-white/10 hover:border-white/25 active:scale-[0.99] cursor-pointer"
          >
            Create Account
          </button>
        </form>

        <div className="mt-8 flex items-center justify-center gap-2 border-t border-white/10 pt-5 text-[11px] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>All financial records remain strictly isolated to your verified identity.</span>
        </div>
      </section>
    </main>
  );
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#07090e] px-4 text-slate-400">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
            <p className="text-sm">Loading sign-in...</p>
          </div>
        </main>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
