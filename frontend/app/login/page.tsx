
import { Suspense } from "react";
import { login, signup } from "./actions";

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
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-600 text-xl font-bold text-white">
          M
        </div>

        <p className="mt-6 text-sm font-medium text-violet-600">
          YOUR PERSONAL FINANCE
        </p>

        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          My Finance OS
        </h1>

        <p className="mt-2 text-sm leading-6 text-slate-500">
          Sign in to manage your accounts, track expenses and stay on top
          of your EMIs.
        </p>

        {message && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            {message}
          </p>
        )}

        {errorMessage && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
          >
            {errorMessage}
          </p>
        )}

        <form className="mt-7 space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              minLength={8}
              required
              placeholder="At least 8 characters"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          <button
            formAction={login}
            className="w-full rounded-xl bg-violet-600 py-3.5 font-semibold text-white hover:bg-violet-700"
          >
            Sign in
          </button>

          <button
            formAction={signup}
            className="w-full rounded-xl border border-slate-200 py-3.5 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Create account
          </button>
        </form>

        <p className="mt-6 text-center text-xs leading-5 text-slate-400">
          Your financial records should only be accessible to you.
        </p>
      </section>
    </main>
  );
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
          <p className="text-sm text-slate-500">Loading sign-in...</p>
        </main>
      }
    >
      <LoginContent searchParams={searchParams} />
    </Suspense>
  );
}
