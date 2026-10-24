
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTransaction } from "./actions";

type TransactionsPageProps = {
    searchParams: Promise<{
        error?: string;
        created?: string;
    }>;
};

type AccountRow = {
    id: string;
    name: string;
    account_type: "bank" | "cash";
    institution: string | null;
    opening_balance_date: string;
};

type TransactionRow = {
    id: string;
    transaction_date: string;
    description: string;
    amount_paise: number | string;
    transaction_type:
    | "income"
    | "expense"
    | "transfer"
    | "card_purchase"
    | "card_payment";
    account_id: string | null;
    from_account_id: string | null;
    category_id: string | null;
};

type CategoryRow = {
    id: string;
    name: string;
};

function formatRupees(paise: number | string) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(Number(paise) / 100);
}

function indiaToday() {
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

function displayDate(value: string) {
    return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
}

function transactionTypeLabel(
    type: TransactionRow["transaction_type"]
) {
    const labels = {
        income: "Income",
        expense: "Expense",
        transfer: "Transfer",
        card_purchase: "Card purchase",
        card_payment: "Card repayment",
    };

    return labels[type];
}

async function TransactionsContent({
    searchParams,
}: TransactionsPageProps) {
    await connection();

    const params = await searchParams;
    const supabase = await createClient();

    const { data: authData, error: authError } =
        await supabase.auth.getClaims();

    const userId = authData?.claims?.sub;

    if (authError || typeof userId !== "string") {
        redirect("/login");
    }

    const [
        accountsResult,
        transactionsResult,
        categoriesResult,
    ] = await Promise.all([
        supabase
            .from("accounts")
            .select(
                "id, name, account_type, institution, opening_balance_date"
            )
            .eq("user_id", userId)
            .eq("is_archived", false)
            .order("name"),

        supabase
            .from("transactions")
            .select(
                "id, transaction_date, description, amount_paise, transaction_type, account_id, from_account_id, category_id"
            )
            .eq("user_id", userId)
            .order("transaction_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(50),

        supabase
            .from("categories")
            .select("id, name")
            .eq("user_id", userId)
            .eq("is_archived", false),
    ]);

    const accounts =
        (accountsResult.data ?? []) as unknown as AccountRow[];

    const transactions =
        (transactionsResult.data ?? []) as unknown as TransactionRow[];

    const categories =
        (categoriesResult.data ?? []) as unknown as CategoryRow[];

    const accountNames = new Map(
        accounts.map((account) => [
            account.id,
            account.name,
        ])
    );

    const categoryNames = new Map(
        categories.map((category) => [
            category.id,
            category.name,
        ])
    );

    const errorMessages: Record<string, string> = {
        "invalid-input":
            "Check the amount, date, description and category. Amounts must be positive, and future dates aren't allowed.",
        "invalid-account-or-date":
            "Select one of your active accounts and a date on or after its opening-balance date.",
        "save-failed":
            "We couldn't save the transaction. Please try again.",
    };

    const historyError =
        Boolean(transactionsResult.error) ||
        Boolean(categoriesResult.error);

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900">
            <div className="mx-auto max-w-xl space-y-6 pb-10">
                <header className="flex items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-violet-600">
                            My Finance OS
                        </p>
                        <h1 className="mt-1 text-2xl font-bold">
                            Transactions
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
                        Transaction saved successfully.
                    </p>
                )}

                {params.error && (
                    <p
                        role="alert"
                        className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
                    >
                        {errorMessages[params.error] ?? "Something went wrong."}
                    </p>
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-bold">
                        Record income or expense
                    </h2>

                    <p className="mt-1 text-sm leading-5 text-slate-500">
                        Save money received or spent from one of your bank
                        accounts or cash wallets.
                    </p>

                    {accountsResult.error ? (
                        <p className="mt-4 text-sm text-rose-700">
                            We couldn't load your accounts. Please try again.
                        </p>
                    ) : accounts.length === 0 ? (
                        <div className="mt-4 rounded-xl bg-slate-50 p-4">
                            <p className="text-sm">
                                Add a bank account or cash wallet before recording
                                a transaction.
                            </p>

                            <Link
                                href="/accounts"
                                className="mt-3 inline-block font-semibold text-violet-700"
                            >
                                Add an account →
                            </Link>
                        </div>
                    ) : (
                        <form
                            action={createTransaction}
                            className="mt-5 space-y-4"
                        >
                            <div>
                                <label
                                    htmlFor="transactionType"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Transaction type
                                </label>

                                <select
                                    id="transactionType"
                                    name="transactionType"
                                    required
                                    defaultValue="expense"
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
                                >
                                    <option value="expense">
                                        Expense — money spent
                                    </option>
                                    <option value="income">
                                        Income — money received
                                    </option>
                                </select>
                            </div>

                            <div>
                                <label
                                    htmlFor="amount"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Amount (₹)
                                </label>

                                <input
                                    id="amount"
                                    name="amount"
                                    type="number"
                                    inputMode="decimal"
                                    min="0.01"
                                    step="0.01"
                                    required
                                    placeholder="e.g. 250"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-lg outline-none focus:border-violet-500"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="description"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Description
                                </label>

                                <input
                                    id="description"
                                    name="description"
                                    type="text"
                                    maxLength={160}
                                    required
                                    placeholder="e.g. Lunch, monthly salary"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="category"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Category
                                </label>

                                <input
                                    id="category"
                                    name="category"
                                    type="text"
                                    maxLength={60}
                                    required
                                    placeholder="e.g. Food & dining, Salary"
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="accountId"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Account used
                                </label>

                                <select
                                    id="accountId"
                                    name="accountId"
                                    required
                                    defaultValue=""
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3"
                                >
                                    <option value="" disabled>
                                        Choose an account
                                    </option>

                                    {accounts.map((account) => (
                                        <option
                                            key={account.id}
                                            value={account.id}
                                        >
                                            {account.name}
                                            {account.institution
                                                ? ` · ${account.institution}`
                                                : ""}
                                            {" · "}
                                            {account.account_type === "bank"
                                                ? "Bank"
                                                : "Cash"}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label
                                    htmlFor="transactionDate"
                                    className="mb-2 block text-sm font-medium"
                                >
                                    Date
                                </label>

                                <input
                                    id="transactionDate"
                                    name="transactionDate"
                                    type="date"
                                    max={indiaToday()}
                                    min={accounts.reduce(
                                        (latest, account) =>
                                            account.opening_balance_date > latest
                                                ? account.opening_balance_date
                                                : latest,
                                        accounts[0].opening_balance_date
                                    )}
                                    defaultValue={indiaToday()}
                                    required
                                    className="w-full rounded-xl border border-slate-200 px-4 py-3"
                                />
                            </div>

                            <button
                                type="submit"
                                className="w-full rounded-xl bg-violet-600 py-3.5 font-semibold text-white hover:bg-violet-700"
                            >
                                Save transaction
                            </button>
                        </form>
                    )}

                    <p className="mt-4 text-xs leading-5 text-slate-400">
                        This first version supports income and expenses paid
                        from a bank or cash account. Credit-card purchases,
                        repayments and transfers will be added separately.
                    </p>
                </section>

                <section className="space-y-3">
                    <div>
                        <h2 className="text-lg font-bold">
                            Recent transactions
                        </h2>

                        <p className="mt-1 text-sm text-slate-500">
                            The latest 50 records saved in your database.
                        </p>
                    </div>

                    {historyError ? (
                        <div className="rounded-xl border border-rose-200 bg-white p-4 text-sm text-rose-700">
                            We couldn't load your transaction history.
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-center">
                            <p className="font-semibold">
                                No transactions yet
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                                Your saved income and expenses will appear here.
                            </p>
                        </div>
                    ) : (
                        transactions.map((transaction) => {
                            const isIncome =
                                transaction.transaction_type === "income";

                            const isTransfer =
                                transaction.transaction_type === "transfer";

                            return (
                                <article
                                    key={transaction.id}
                                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                                >
                                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                                        {isIncome
                                            ? "↙"
                                            : isTransfer
                                                ? "⇄"
                                                : "↗"}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold">
                                            {transaction.description}
                                        </p>

                                        <p className="mt-1 text-xs text-slate-500">
                                            {categoryNames.get(
                                                transaction.category_id ?? ""
                                            ) ??
                                                transactionTypeLabel(
                                                    transaction.transaction_type
                                                )}
                                            {" · "}
                                            {displayDate(transaction.transaction_date)}
                                        </p>

                                        <p className="mt-1 truncate text-xs text-slate-400">
                                            {accountNames.get(
                                                transaction.account_id ?? ""
                                            ) ??
                                                (transaction.from_account_id
                                                    ? "Transfer or card payment"
                                                    : "Credit card")}
                                        </p>
                                    </div>

                                    <p
                                        className={`shrink-0 text-right text-sm font-bold ${isIncome
                                                ? "text-emerald-600"
                                                : "text-slate-900"
                                            }`}
                                    >
                                        {isIncome
                                            ? "+"
                                            : isTransfer
                                                ? ""
                                                : "−"}
                                        {isTransfer
                                            ? ""
                                            : formatRupees(transaction.amount_paise)}
                                    </p>
                                </article>
                            );
                        })
                    )}
                </section>
            </div>
        </main>
    );
}

export default function TransactionsPage({
    searchParams,
}: TransactionsPageProps) {
    return (
        <Suspense
            fallback={
                <main className="min-h-screen bg-slate-50 p-6">
                    <p className="text-sm text-slate-500">
                        Loading transactions...
                    </p>
                </main>
            }
        >
            <TransactionsContent searchParams={searchParams} />
        </Suspense>
    );
}
