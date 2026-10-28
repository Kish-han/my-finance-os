"use client";

import { useState } from "react";
import { X, Clock, ArrowRight } from "lucide-react";
import { snoozeRecurringOccurrence } from "./actions";

export interface SnoozeModalData {
  occurrenceId: string;
  title: string;
  dueDate: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: SnoozeModalData | null;
  today: string;
  returnTo?: string;
}

export function SnoozeRecurringModal({
  isOpen,
  onClose,
  data,
  today,
  returnTo = "/",
}: Props) {
  function addDays(baseDate: string, days: number): string {
    const [y, m, d] = baseDate.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    date.setUTCDate(date.getUTCDate() + days);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
      date.getUTCDate()
    ).padStart(2, "0")}`;
  }

  const [snoozeDate, setSnoozeDate] = useState<string>(
    data ? addDays(data.dueDate > today ? data.dueDate : today, 3) : today
  );

  if (!isOpen || !data) return null;

  const base = data.dueDate > today ? data.dueDate : today;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#141922] p-6 shadow-2xl text-[#dfe2eb]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Snooze Reminder</h3>
              <p className="text-xs text-slate-400">Delay reminder without altering schedule</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-300">
          Snooze reminder for <strong className="text-white">{data.title}</strong> until a later date. This occurrence will remain pending and remind you when that date arrives.
        </p>

        {/* Quick presets */}
        <div className="mt-4">
          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Quick Delay Presets
          </label>
          <div className="grid grid-cols-4 gap-2">
            {[1, 3, 7, 14].map((days) => {
              const target = addDays(base, days);
              const isSelected = snoozeDate === target;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => setSnoozeDate(target)}
                  className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all ${
                    isSelected
                      ? "bg-amber-500/20 border-amber-400 text-amber-300 shadow-sm"
                      : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  +{days} {days === 1 ? "day" : "days"}
                </button>
              );
            })}
          </div>
        </div>

        <form action={snoozeRecurringOccurrence} className="mt-5 space-y-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="occurrenceId" value={data.occurrenceId} />

          <div>
            <label
              htmlFor="snooze-dt"
              className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5"
            >
              Remind Me On *
            </label>
            <input
              id="snooze-dt"
              name="snoozeUntilDate"
              type="date"
              required
              min={today}
              value={snoozeDate}
              onChange={(e) => setSnoozeDate(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold tabular-nums text-white outline-none focus:border-amber-400 focus:bg-white/10 focus:ring-2 focus:ring-amber-400/20"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/25 transition-all active:scale-95 cursor-pointer"
            >
              <span>Set Snooze Date</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
