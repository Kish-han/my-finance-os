"use client";

import { useState } from "react";
import { TrendingUp, Sparkles } from "lucide-react";

type Timeframe = "1D" | "1W" | "1M" | "1Y" | "ALL";

interface AuraGrowthChartProps {
  currentValuePaise?: number;
  trajectoryGrowthPct?: number;
  title?: string;
  subtitle?: string;
}

export function AuraGrowthChart({
  currentValuePaise = 24500000,
  trajectoryGrowthPct = 14.8,
  title = "Wealth Trajectory & Asset Growth",
  subtitle = "Computed dynamic projection based on active liquidity and debt payoff schedules",
}: AuraGrowthChartProps) {
  const [activeTimeframe, setActiveTimeframe] = useState<Timeframe>("1M");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const formatRupees = (paise: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(paise / 100);
  };

  // Mock multi-point trajectory for stepped area
  const basePoints = [
    { label: "Day 1", value: currentValuePaise * 0.88 },
    { label: "Day 5", value: currentValuePaise * 0.91 },
    { label: "Day 10", value: currentValuePaise * 0.89 },
    { label: "Day 15", value: currentValuePaise * 0.94 },
    { label: "Day 20", value: currentValuePaise * 0.93 },
    { label: "Day 25", value: currentValuePaise * 0.97 },
    { label: "Day 30", value: currentValuePaise },
  ];

  const minValue = Math.min(...basePoints.map((p) => p.value));
  const maxValue = Math.max(...basePoints.map((p) => p.value));
  const range = maxValue - minValue || 1;

  // SVG dimensions
  const width = 600;
  const height = 180;
  const paddingX = 20;
  const paddingY = 25;

  const points = basePoints.map((point, index) => {
    const x =
      paddingX +
      (index / (basePoints.length - 1)) * (width - 2 * paddingX);
    const normalizedY = (point.value - minValue) / range;
    const y = height - paddingY - normalizedY * (height - 2 * paddingY);
    return { ...point, x, y };
  });

  // Build SVG path
  const linePath = points.reduce((path, pt, idx, arr) => {
    if (idx === 0) return `M ${pt.x},${pt.y}`;
    const prev = arr[idx - 1];
    const cpX = (prev.x + pt.x) / 2;
    return `${path} C ${cpX},${prev.y} ${cpX},${pt.y} ${pt.x},${pt.y}`;
  }, "");

  const areaPath = `${linePath} L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;

  const activePoint =
    hoveredIndex !== null ? points[hoveredIndex] : points[points.length - 1];

  return (
    <div className="aura-panel p-6 sm:p-7 relative overflow-hidden group">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-60 w-60 rounded-full bg-emerald-500/10 blur-3xl animate-pulse-glow" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 h-60 w-60 rounded-full bg-cyan-500/10 blur-3xl" />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              TELEMETRY & PROJECTIONS
            </span>
          </div>
          <h3 className="mt-1 text-base sm:text-lg font-black tracking-tight text-white">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>
        </div>

        {/* Timeframe pills */}
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md self-start sm:self-auto">
          {(["1D", "1W", "1M", "1Y", "ALL"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setActiveTimeframe(tf)}
              className={`rounded-full px-3 py-1 text-[11px] font-bold transition-all ${
                activeTimeframe === tf
                  ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/25"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Trajectory Stat & Scrubber readout */}
      <div className="relative z-10 mt-6 flex items-baseline justify-between">
        <div>
          <div className="text-3xl sm:text-4xl font-black tracking-tight text-white tabular-nums">
            {formatRupees(activePoint.value)}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-0.5 font-bold text-emerald-400">
              <TrendingUp className="h-3.5 w-3.5" />
              +{trajectoryGrowthPct}%
            </span>
            <span className="text-slate-400">
              in past {activeTimeframe === "1M" ? "month" : activeTimeframe}
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 bg-white/5 border border-white/10 rounded-full px-3 py-1">
          <Sparkles className="h-3 w-3 text-emerald-400" />
          <span>Scrubber: {activePoint.label}</span>
        </div>
      </div>

      {/* SVG Chart area */}
      <div className="relative z-10 mt-6 h-44 w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="growthGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4edea3" stopOpacity="0.35" />
              <stop offset="60%" stopColor="#10b981" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#0a0e14" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#4edea3" />
              <stop offset="100%" stopColor="#d0bcff" />
            </linearGradient>
            <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill="url(#growthGradient)" />

          {/* Stroke Line */}
          <path
            d={linePath}
            fill="none"
            stroke="url(#lineStroke)"
            strokeWidth="2.5"
            strokeLinecap="round"
            filter="url(#neonGlow)"
          />

          {/* Points & Interactive Nodes */}
          {points.map((pt, idx) => {
            const isHovered =
              hoveredIndex === idx ||
              (hoveredIndex === null && idx === points.length - 1);
            return (
              <g
                key={idx}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-pointer"
              >
                {/* Invisible hover target */}
                <circle cx={pt.x} cy={pt.y} r="18" fill="transparent" />

                {/* Outer halo */}
                {isHovered && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="8"
                    className="fill-emerald-400/20 stroke-emerald-400/50"
                    strokeWidth="1.5"
                  />
                )}

                {/* Inner point */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? "4" : "2.5"}
                  className={
                    isHovered
                      ? "fill-white stroke-emerald-400"
                      : "fill-emerald-400 stroke-[#10141a]"
                  }
                  strokeWidth="2"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Axis markers */}
      <div className="relative z-10 mt-2 flex justify-between border-t border-white/5 pt-2 text-[10px] font-mono uppercase text-slate-500">
        <span>{basePoints[0].label}</span>
        <span>{basePoints[Math.floor(basePoints.length / 2)].label}</span>
        <span>{basePoints[basePoints.length - 1].label}</span>
      </div>
    </div>
  );
}
