import Link from "next/link";
import type { ReactNode } from "react";

export default function EmiLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div>
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
          <Link
            href="/emi"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            EMI Overview
          </Link>

          <Link
            href="/emi/payments"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Record Payment
          </Link>

          <Link
            href="/emi/foreclosure"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Foreclosure Calculator
          </Link>

          <Link
            href="/emi/foreclosure/settle"
            className="rounded-lg bg-slate-950 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Record Actual Foreclosure
          </Link>
        </div>
      </nav>

      {children}
    </div>
  );
}