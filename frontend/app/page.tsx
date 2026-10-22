
"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";

type Transaction = {
  id: number;
  title: string;
  category: string;
  date: string;
  amount: number;
  type: "expense" | "income";
};

const initialTransactions: Transaction[] = [
  {
    id: 1,
    title: "Groceries",
    category: "Food & dining",
    date: "Today · 12:40 PM",
    amount: 850,
    type: "expense",
  },
  {
    id: 2,
    title: "Cab ride",
    category: "Transport",
    date: "Today · 9:15 AM",
    amount: 240,
    type: "expense",
  },
  {
    id: 3,
    title: "Salary",
    category: "Income",
    date: "Yesterday",
    amount: 65000,
    type: "income",
  },
  {
    id: 4,
    title: "Coffee",
    category: "Food & dining",
    date: "Yesterday",
    amount: 180,
    type: "expense",
  },
];

const money = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);

const categories = [
  "Food & dining",
  "Transport",
  "Shopping",
  "Bills & utilities",
  "Health",
  "Other",
];

export default function Home() {
  const [transactions, setTransactions] = useState(initialTransactions);
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<"expense" | "income">("expense");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Food & dining");

  const income = useMemo(
    () =>
      transactions
        .filter((item) => item.type === "income")
        .reduce((total, item) => total + item.amount, 0),
    [transactions]
  );

  const expenses = useMemo(
    () =>
      transactions
        .filter((item) => item.type === "expense")
        .reduce((total, item) => total + item.amount, 0),
    [transactions]
  );

  function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedAmount = Number(amount);

    if (!title.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return;
    }

    const now = new Date().toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
    });

    const newTransaction: Transaction = {
      id: Date.now(),
      title: title.trim(),
      category: type === "income" ? "Income" : category,
      date: `Today · ${now}`,
      amount: parsedAmount,
      type,
    };

    setTransactions((current) => [newTransaction, ...current]);
    setTitle("");
    setAmount("");
    setCategory("Food & dining");
    setShowForm(false);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto min-h-screen max-w-5xl px-4 pb-28 sm:px-6 sm:pb-8">
        <header className="flex items-center justify-between py-5">
          <div>
            <p className="text-xs font-medium tracking-wide text-violet-600">
              YOUR PERSONAL FINANCE
            </p>
            <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
              My Finance OS
            </h1>
          </div>

          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 font-semibold text-violet-700">
            M
          </div>
        </header>

        <section className="rounded-3xl bg-slate-900 p-5 text-white sm:p-7">
          <p className="text-sm text-slate-300">Your monthly overview</p>
          <p className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            {money(income - expenses)}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Recorded income minus recorded expenses
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <span className="text-emerald-300">↙</span>
                Income
              </div>
              <p className="mt-2 text-lg font-semibold">
                {money(income)}
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <span className="text-rose-300">↗</span>
                Expenses
              </div>
              <p className="mt-2 text-lg font-semibold">
                {money(expenses)}
              </p>
            </div>
          </div>
        </section>

        <section className="mt-7">
          <div>
            <h2 className="text-lg font-bold">Your activity</h2>
            <p className="mt-1 text-sm text-slate-500">
              Keep track of where your money goes.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {transactions.map((item) => {
              const icon =
                item.type === "income"
                  ? "↙"
                  : item.category === "Food & dining"
                    ? "🍽️"
                    : item.category === "Transport"
                      ? "🚕"
                      : item.category === "Shopping"
                        ? "🛍️"
                        : "💳";

              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-lg">
                    {icon}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.category} · {item.date}
                    </p>
                  </div>

                  <p
                    className={`shrink-0 text-sm font-bold ${
                      item.type === "income"
                        ? "text-emerald-600"
                        : "text-slate-900"
                    }`}
                  >
                    {item.type === "income" ? "+" : "−"}
                    {money(item.amount)}
                  </p>
                </div>
              );
            })}
          </div>

          <p className="mt-4 text-center text-xs text-slate-400">
            Sample transactions for development
          </p>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-4 backdrop-blur sm:hidden">
        <button
          onClick={() => {
            setType("expense");
            setShowForm(true);
          }}
          className="w-full rounded-2xl bg-violet-600 py-4 text-base font-semibold text-white shadow-lg shadow-violet-200 active:scale-[0.99]"
        >
          + Add expense
        </button>
      </div>

      <div className="mx-auto hidden max-w-5xl justify-end px-6 pb-6 sm:flex">
        <button
          onClick={() => {
            setType("expense");
            setShowForm(true);
          }}
          className="rounded-xl bg-violet-600 px-5 py-3 font-semibold text-white hover:bg-violet-700"
        >
          + Add transaction
        </button>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-5"
          onClick={() => setShowForm(false)}
        >
          <section
            className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />

            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Add transaction</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Record it while it is fresh.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full bg-slate-100 px-3 py-2 text-slate-600"
                aria-label="Close form"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
              {(["expense", "income"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  className={`rounded-lg py-3 text-sm font-semibold capitalize ${
                    type === option
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <form onSubmit={saveTransaction} className="mt-5 space-y-4">
              <div>
                <label
                  htmlFor="amount"
                  className="mb-2 block text-sm font-medium"
                >
                  Amount (₹)
                </label>
                <input
                  autoFocus
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  step="0.01"
                  required
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0"
                  className="w-full rounded-xl border border-slate-200 px-4 py-4 text-2xl font-semibold outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </div>

              <div>
                <label
                  htmlFor="title"
                  className="mb-2 block text-sm font-medium"
                >
                  What was it for?
                </label>
                <input
                  id="title"
                  required
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={
                    type === "expense" ? "e.g. Lunch, groceries" : "e.g. Salary"
                  }
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
                />
              </div>

              {type === "expense" && (
                <div>
                  <label
                    htmlFor="category"
                    className="mb-2 block text-sm font-medium"
                  >
                    Category
                  </label>
                  <select
                    id="category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none focus:border-violet-500"
                  >
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full rounded-xl bg-violet-600 py-4 font-semibold text-white hover:bg-violet-700"
              >
                Save {type}
              </button>
            </form>

            <p className="mt-3 text-center text-xs leading-5 text-slate-400">
              This prototype stores entries in memory only. Permanent saving
              comes when we connect the database.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
