"use client";

import { ShieldCheck } from "lucide-react";

interface AuraVitalityScoreProps {
  score?: number;
  tier?: string;
  liquidityRatio?: string;
  debtHealth?: string;
  creditUtilizationPct?: number;
}

export function AuraVitalityScore({
  score = 98,
  tier = "Elite Tier",
  liquidityRatio = "4.8x Reserves",
  debtHealth = "Optimized",
  creditUtilizationPct = 12,
}: AuraVitalityScoreProps) {
  // Circular gauge math
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="aura-panel p-6 sm:p-7 relative overflow-hidden group">
      <div className="pointer-events-none absolute -left-12 -top-12 h-44 w-44 rounded-full bg-emerald-500/10 blur-2xl" />

      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        {/* Left: Gauge and Tier */}
        <div className="flex items-center gap-6">
          <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 128 128">
              <circle
                cx="64"
                cy="64"
                r={radius}
                className="stroke-white/10"
                strokeWidth="8"
                fill="transparent"
              />
              <circle
                cx="64"
                cy="64"
                r={radius}
                stroke="url(#vitalityGradient)"
                strokeWidth="8"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                fill="transparent"
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="vitalityGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#4edea3" />
                  <stop offset="50%" stopColor="#10b981" />
                  <stop offset="100%" stopColor="#d0bcff" />
                </linearGradient>
              </defs>
            </svg>

            {/* Center score readout */}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-3xl font-black tracking-tight text-white tabular-nums">
                {score}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                / 100
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                {tier}
              </span>
            </div>
            <h3 className="mt-1 text-lg font-black tracking-tight text-white">
              Financial Vitality
            </h3>
            <p className="mt-1 text-xs text-slate-400 max-w-xs leading-relaxed">
              Top 2% telemetry across risk amortization, liquidity buffer, and debt coverage.
            </p>
          </div>
        </div>

        {/* Right: Metric mini-cards */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 w-full sm:w-auto">
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-center">
            <span className="block text-[10px] uppercase font-bold text-slate-500">
              Coverage
            </span>
            <span className="mt-1 block text-sm font-black text-white">
              {liquidityRatio}
            </span>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-center">
            <span className="block text-[10px] uppercase font-bold text-slate-500">
              Debt Health
            </span>
            <span className="mt-1 block text-sm font-black text-emerald-400">
              {debtHealth}
            </span>
          </div>

          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-3 text-center">
            <span className="block text-[10px] uppercase font-bold text-slate-500">
              Revolving
            </span>
            <span className="mt-1 block text-sm font-black text-white">
              {creditUtilizationPct}% Util.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
