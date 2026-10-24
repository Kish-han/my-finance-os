import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAccount } from "./actions";

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

async function AccountsContent({
  searchParams,
}: AccountsPageProps) {
  // Wait for the incoming request before accessing session-dependent data.
  await connection();

  const params = await searchParams;
  const supabase = await createClient();

  const { data: authData, error: authError } =
    await supabase.auth.getClaims();

  const userId = authData?.claims?.sub;

  if (authError || typeof userId !== "string") {
    redirect("/login");
  }

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

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-xl space-y-6 pb-10">
        <header className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-violet-600">
              My Finance OS
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              Your accounts
            </h1>
          </div>

          <Link
            href="/"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
          >
            Dashboard
          </Link>
        </header>

        {params.created === "1" && (
          <p
            role="status"
            className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            Account saved successfully.
          </p>
        )}

        {params.error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
          >
            {messages[params.error] ?? "Something went wrong."}
          </p>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">Add an account</h2>

          <p className="mt-1 text-sm leading-5 text-slate-500">
            Record a bank account or cash wallet and its opening balance.
          </p>

          <form action={createAccount} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium"
              >
                Account name
              </label>

              <input
                id="name"
                name="name"
                required
                maxLength={80}
                placeholder="e.g. Demo Savings"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="accountType"
                className="mb-2 block text-sm font-medium"
              >
                Account type
              </label>

              <select
                id="accountType"
                name="accountType"
                required
                defaultValue="bank"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
              >
                <option value="bank">Bank account</option>
                <option value="cash">Cash wallet</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="institution"
                className="mb-2 block text-sm font-medium"
              >
                Bank or institution (optional)
              </label>

              <input
                id="institution"
                name="institution"
                maxLength={100}
                placeholder="e.g. ICICI Bank"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="openingBalance"
                className="mb-2 block text-sm font-medium"
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
                className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
              />
            </div>

            <div>
              <label
                htmlFor="openingBalanceDate"
                className="mb-2 block text-sm font-medium"
              >
                Balance as of date
              </label>

              <input
                id="openingBalanceDate"
                name="openingBalanceDate"
                type="date"
                required
                className="w-full rounded-xl border border-slate-200 px-4 py-3"
              />

              <p className="mt-1 text-xs leading-5 text-slate-500">
                The balance before transactions recorded on this date.
              </p>
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-violet-600 py-3.5 font-semibold text-white hover:bg-violet-700"
            >
              Save account
            </button>
          </form>
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold">Saved accounts</h2>

            <p className="mt-1 text-sm text-slate-500">
              Accounts retrieved from your Supabase database.
            </p>
          </div>

          {accountsError ? (
            <p className="rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-700">
              We couldn't load your accounts. Check your database
              connection and try again.
            </p>
          ) : !accounts?.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
              <p className="font-medium">No accounts saved yet</p>

              <p className="mt-1 text-sm text-slate-500">
                Add a test account using the form above.
              </p>
            </div>
          ) : (
            accounts.map((account) => (
              <article
                key={account.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      {account.name}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {account.institution ||
                        "No institution specified"}{" "}
                      ·{" "}
                      {account.account_type === "bank"
                        ? "Bank account"
                        : "Cash"}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      Opening balance as of{" "}
                      {account.opening_balance_date}
                    </p>
                  </div>

                  <p className="shrink-0 text-sm font-bold">
                    {formatRupees(account.opening_balance_paise)}
                  </p>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

export default function AccountsPage({
  searchParams,
}: AccountsPageProps) {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-50 p-6">
          <p className="text-sm text-slate-500">
            Loading your accounts...
          </p>
        </main>
      }
    >
      <AccountsContent searchParams={searchParams} />
    </Suspense>
  );
}