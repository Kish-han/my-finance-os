"use client";

import { useState, useRef } from "react";
import { Eye, EyeOff, TrendingUp } from "lucide-react";

interface AuraCardStackProps {
  balanceFormatted: string;
  cardholderName?: string;
  activeAccountsCount: number;
  totalCardsCount: number;
  currencyCode?: string;
  growthPercent?: string;
}

export function AuraCardStack({
  balanceFormatted,
  cardholderName = "PRIVATE CLIENT",
  activeAccountsCount,
  totalCardsCount,
  currencyCode = "INR",
  growthPercent = "+4.82%",
}: AuraCardStackProps) {
  const [isMasked, setIsMasked] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotateX = (-y / rect.height) * 10;
    const rotateY = (x / rect.width) * 10;
    card.style.transform = `perspective(900px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.01, 1.01, 1.01)`;
  }

  function handlePointerLeave() {
    const card = cardRef.current;
    if (!card) return;
    card.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)";
  }

  return (
    <div className="relative w-full pt-3 pb-2 flex flex-col items-center select-none">
      {/* Background Card 2: Champagne Gold Card (Top Back) */}
      <div className="w-[88%] h-24 rounded-2xl aura-card-gold -mb-20 shadow-md transform scale-[0.88] -translate-y-3 opacity-75 flex items-start justify-between p-3.5 transition-all duration-300">
        <span className="text-[10px] font-bold tracking-widest text-[#2c1d02] uppercase font-mono">
          AURIC RESERVE
        </span>
        <span className="text-[10px] text-[#2c1d02]/80 font-mono">
          •••• 8820
        </span>
      </div>

      {/* Background Card 1: Prismatic Amethyst Card (Middle Back) */}
      <div className="w-[94%] h-28 rounded-2xl aura-card-amethyst -mb-20 shadow-lg transform scale-[0.94] -translate-y-1.5 opacity-90 flex items-start justify-between p-4 transition-all duration-300">
        <span className="text-[10px] font-semibold tracking-wider text-[#d0bcff] uppercase font-mono">
          INFINITE FLOW
        </span>
        <div className="flex items-center gap-1 opacity-70">
          <div className="w-3.5 h-3.5 rounded-full bg-white/40" />
          <div className="w-3.5 h-3.5 rounded-full bg-white/30 -ml-1.5" />
        </div>
      </div>

      {/* Foreground Primary Card: Obsidian Visa Sovereign Card */}
      <div
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        className="aura-card-obsidian relative w-full aspect-[1.586/1] max-w-lg rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between overflow-hidden cursor-pointer transition-transform duration-300 active:scale-[0.99]"
      >
        {/* Subtle Specular Highlights and Carbon Sheen */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-[#4edea3]/10 pointer-events-none" />
        <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-[#4edea3]/10 blur-2xl pointer-events-none" />

        {/* Card Top: Chips & Brand */}
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Brushed Brass EMV Chip */}
            <div className="w-9 h-7 rounded-sm bg-gradient-to-br from-[#d4af37] via-[#f7e7a9] to-[#996515] p-0.5 shadow-inner flex flex-col justify-around">
              <div className="w-full h-px bg-[#4a3407]/40" />
              <div className="w-full h-px bg-[#4a3407]/40" />
              <div className="w-full h-px bg-[#4a3407]/40" />
            </div>
            {/* Contactless Waves Glyph */}
            <span className="text-xs text-[#bbcabf] font-mono tracking-widest">
              )))
            </span>
          </div>

          {/* Visa Sovereign Monogram */}
          <div className="flex items-center gap-1">
            <span className="text-lg font-black italic tracking-tighter text-white">
              VISA
            </span>
            <span className="text-[10px] tracking-widest text-[#4edea3] font-bold ml-1 uppercase">
              Infinite
            </span>
          </div>
        </div>

        {/* Card Mid: Dynamic Valuation */}
        <div className="relative z-10 my-auto pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] tracking-wider text-[#bbcabf] uppercase font-medium flex items-center gap-1.5">
              <span>Total Vault Liquidity</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMasked(!isMasked);
                }}
                className="text-[#bbcabf] hover:text-white transition-colors"
                title={isMasked ? "Show Balance" : "Hide Balance"}
              >
                {isMasked ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </span>

            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#4edea3]/15 text-[#4edea3]">
              <TrendingUp className="h-3 w-3" />
              <span className="text-[11px] font-semibold">{growthPercent}</span>
            </div>
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl md:text-5xl font-black text-white tracking-tight tabular-nums">
              {isMasked ? "••••••••••••" : balanceFormatted}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono text-[#bbcabf]">
              {activeAccountsCount} Accounts
            </span>
            <span className="text-[#bbcabf]/40">•</span>
            <span className="text-xs text-[#bbcabf]">
              {totalCardsCount} Active Cards
            </span>
            <span className="text-[#bbcabf]/40">•</span>
            <span className="text-[11px] font-mono uppercase text-[#4edea3]">
              {currencyCode}
            </span>
          </div>
        </div>

        {/* Card Bottom: Cardholder Credentials & Etched Tactile Digits */}
        <div className="relative z-10 flex items-end justify-between pt-1">
          <div className="flex flex-col">
            <span className="text-[9px] tracking-wider text-[#bbcabf]/70 uppercase font-medium">
              Private Member
            </span>
            <span className="text-xs sm:text-sm text-white tracking-wide font-semibold uppercase">
              {cardholderName}
            </span>
          </div>

          <div className="flex flex-col items-end">
            <span className="font-mono text-xs tracking-widest text-[#bbcabf]">
              •••• 4920
            </span>
            <span className="font-mono text-[10px] text-[#bbcabf]/60">
              09/29
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
