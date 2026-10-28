"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import {
  CreditCard,
  Plus,
  Calendar,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  ShoppingBag,
  Wallet,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  CheckCircle2,
  TrendingUp,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { resolveCardBrand } from "@/lib/finance/card-networks";

export type CreditCardItem = {
  id: string;
  name: string;
  bank_name: string;
  last_four_digits: string | null;
  cardholder_name?: string | null;
  card_network?: string | null;
  credit_limit_paise: number | string;
  opening_outstanding_paise: number | string;
  opening_outstanding_date: string;
  statement_day: number | null;
  payment_due_day: number | null;
  outstandingPaise: number;
  availablePaise: number;
  utilizationPct: number;
};

export type CardTransactionItem = {
  id: string;
  transaction_date: string;
  description: string;
  amount_paise: number | string;
  transaction_type: "card_purchase" | "card_payment" | string;
  credit_card_id: string | null;
};

interface CreditCardStackViewProps {
  cards: CreditCardItem[];
  transactions: CardTransactionItem[];
  canCalculateBalances: boolean;
  totalLimitPaise: number;
  totalOutstandingPaise: number;
  totalAvailablePaise: number;
  overallUtilization: number;
  cardholderName: string;
}

const CARD_THEMES = [
  {
    name: "Obsidian Sovereign",
    className: "aura-card-obsidian text-white",
    bgStyle: {
      background: "linear-gradient(135deg, #171c24 0%, #0b0e14 60%, #141922 100%)",
      borderColor: "rgba(255, 255, 255, 0.16)",
      color: "#ffffff",
    },
    headerTextColor: "text-[#bbcabf]",
    accentColor: "#4edea3",
    chipBg: "from-[#d4af37] via-[#f7e7a9] to-[#996515]",
    chipLines: "#4a3407",
    glowColor: "rgba(78, 222, 163, 0.15)",
  },
  {
    name: "Prismatic Amethyst",
    className: "aura-card-amethyst text-white",
    bgStyle: {
      background: "linear-gradient(135deg, #571bc1 0%, #31353c 50%, #d0bcff 100%)",
      borderColor: "rgba(255, 255, 255, 0.2)",
      color: "#ffffff",
    },
    headerTextColor: "text-[#d0bcff]",
    accentColor: "#d0bcff",
    chipBg: "from-[#e2e8f0] via-[#ffffff] to-[#94a3b8]",
    chipLines: "#334155",
    glowColor: "rgba(208, 188, 255, 0.2)",
  },
  {
    name: "Auric Reserve",
    className: "aura-card-gold text-[#2c1d02]",
    bgStyle: {
      background: "linear-gradient(135deg, #d4af37 0%, #f3e5ab 50%, #aa771c 100%)",
      borderColor: "rgba(255, 255, 255, 0.3)",
      color: "#2c1d02",
    },
    headerTextColor: "text-[#2c1d02]",
    accentColor: "#d4af37",
    chipBg: "from-[#2c1d02] via-[#4a3407] to-[#1a1101]",
    chipLines: "#d4af37",
    glowColor: "rgba(212, 175, 55, 0.25)",
  },
  {
    name: "Emerald Reserve",
    className: "text-white",
    bgStyle: {
      background: "linear-gradient(135deg, #09261a 0%, #04120c 55%, #0e3a28 100%)",
      borderColor: "rgba(52, 211, 153, 0.3)",
      color: "#ffffff",
    },
    headerTextColor: "text-emerald-300",
    accentColor: "#34d399",
    chipBg: "from-[#d4af37] via-[#f7e7a9] to-[#996515]",
    chipLines: "#4a3407",
    glowColor: "rgba(52, 211, 153, 0.2)",
  },
  {
    name: "Velvet Ruby",
    className: "text-white",
    bgStyle: {
      background: "linear-gradient(135deg, #3d091e 0%, #18040b 55%, #4a0c25 100%)",
      borderColor: "rgba(251, 113, 133, 0.3)",
      color: "#ffffff",
    },
    headerTextColor: "text-rose-300",
    accentColor: "#fb7185",
    chipBg: "from-[#ffd166] via-[#fff1c5] to-[#c7911e]",
    chipLines: "#543700",
    glowColor: "rgba(251, 113, 133, 0.2)",
  },
  {
    name: "Midnight Sapphire",
    className: "text-white",
    bgStyle: {
      background: "linear-gradient(135deg, #0c1c36 0%, #060e1c 55%, #142e56 100%)",
      borderColor: "rgba(56, 189, 248, 0.3)",
      color: "#ffffff",
    },
    headerTextColor: "text-sky-300",
    accentColor: "#38bdf8",
    chipBg: "from-[#e2e8f0] via-[#ffffff] to-[#94a3b8]",
    chipLines: "#334155",
    glowColor: "rgba(56, 189, 248, 0.2)",
  },
];

function formatRupees(paise: number | string): string {
  const num = Number(paise);
  const isNegative = num < 0;
  const absFormatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Math.abs(num) / 100);

  return isNegative ? `-${absFormatted}` : absFormatted;
}

function ordinalDay(day: number | null): string {
  if (day === null) return "Not set";
  const lastTwoDigits = day % 100;
  let suffix = "th";
  if (lastTwoDigits < 11 || lastTwoDigits > 13) {
    if (day % 10 === 1) suffix = "st";
    else if (day % 10 === 2) suffix = "nd";
    else if (day % 10 === 3) suffix = "rd";
  }
  return `${day}${suffix}`;
}

function formatDate(value: string): string {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  } catch {
    return value;
  }
}

function renderBrandMonogram(brand: string, isLightCard: boolean) {
  if (brand === "VISA") {
    return (
      <div className="flex items-center gap-1">
        <span
          className={`text-base sm:text-lg font-black italic tracking-tighter ${
            isLightCard ? "text-[#2c1d02]" : "text-white"
          }`}
        >
          VISA
        </span>
        <span
          className={`text-[10px] tracking-widest font-bold uppercase ${
            isLightCard ? "text-[#543b0c]" : "text-[#4edea3]"
          }`}
        >
          Infinite
        </span>
      </div>
    );
  }
  if (brand === "MASTERCARD") {
    return (
      <div className="flex items-center -space-x-1.5 opacity-90">
        <div className="w-4 h-4 rounded-full bg-rose-500/90 shadow-sm" />
        <div className="w-4 h-4 rounded-full bg-amber-400/90 shadow-sm" />
      </div>
    );
  }
  if (brand === "RUPAY") {
    return (
      <span
        className={`text-xs sm:text-sm font-black italic tracking-wider ${
          isLightCard ? "text-[#2c1d02]" : "text-white"
        }`}
      >
        RuPay<span className="text-amber-500 font-bold">❯</span>
      </span>
    );
  }
  if (brand === "AMEX") {
    return (
      <span
        className={`text-[10px] font-black tracking-widest uppercase border px-1.5 py-0.5 rounded ${
          isLightCard ? "border-[#2c1d02]/30 text-[#2c1d02]" : "border-white/30 text-white"
        }`}
      >
        AMEX
      </span>
    );
  }
  if (brand === "DINERS") {
    return (
      <span
        className={`text-[9px] font-black tracking-wider uppercase border px-1.5 py-0.5 rounded ${
          isLightCard ? "border-[#2c1d02]/30 text-[#2c1d02]" : "border-cyan-300/30 text-cyan-300"
        }`}
      >
        DINERS CLUB
      </span>
    );
  }
  return (
    <span
      className={`text-[10px] font-bold tracking-wider uppercase border px-1.5 py-0.5 rounded ${
        isLightCard ? "border-[#2c1d02]/20 text-[#2c1d02]" : "border-white/20 text-slate-300"
      }`}
    >
      CARD
    </span>
  );
}

export function CreditCardStackView({
  cards,
  transactions,
  canCalculateBalances,
  totalLimitPaise,
  totalOutstandingPaise,
  totalAvailablePaise,
  overallUtilization,
  cardholderName,
}: CreditCardStackViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isTotalMasked, setIsTotalMasked] = useState(false);
  const [isCardMasked, setIsCardMasked] = useState(false);

  // Real-time wheel rotation offset (in pixels)
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const cardContainerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const isBusyRef = useRef(false);

  const selectedCard = cards[selectedIndex] || cards[0] || null;

  // Transactions for the selected primary card (most recent first)
  const cardTransactions = selectedCard
    ? transactions
        .filter((tx) => tx.credit_card_id === selectedCard.id)
        .slice()
        .reverse()
    : [];

  // =========================================================
  // 3D Circular Wheel Rotation
  // direction +1: rotate UP (card below comes to primary)
  // direction -1: rotate DOWN (card above comes to primary)
  // =========================================================
  const triggerRotate = useCallback(
    (direction: 1 | -1) => {
      if (cards.length <= 1 || isBusyRef.current) return;
      isBusyRef.current = true;
      setIsTransitioning(true);

      // Animate dragY in circular direction
      setDragY(direction === 1 ? -150 : 150);

      setTimeout(() => {
        setSelectedIndex((prev) => (prev + direction + cards.length) % cards.length);
        setDragY(0);
        setIsTransitioning(false);
        isBusyRef.current = false;
      }, 340);
    },
    [cards.length]
  );

  // Directly select a card with smooth directional rotation
  const handleSelectCard = useCallback(
    (targetIdx: number) => {
      if (targetIdx === selectedIndex || cards.length <= 1 || isBusyRef.current) return;
      let diff = targetIdx - selectedIndex;
      const half = cards.length / 2;
      while (diff > half) diff -= cards.length;
      while (diff < -half) diff += cards.length;

      isBusyRef.current = true;
      setIsTransitioning(true);
      // Directional rotation towards target
      setDragY(diff > 0 ? -150 : 150);

      setTimeout(() => {
        setSelectedIndex(targetIdx);
        setDragY(0);
        setIsTransitioning(false);
        isBusyRef.current = false;
      }, 340);
    },
    [cards.length, selectedIndex]
  );

  // Mouse wheel listener
  function handleWheel(e: React.WheelEvent) {
    if (cards.length <= 1 || isBusyRef.current) return;
    if (Math.abs(e.deltaY) < 16) return;

    if (e.deltaY > 0) {
      triggerRotate(1); // Wheel down -> rotate UP (bottom card to center)
    } else {
      triggerRotate(-1); // Wheel up -> rotate DOWN (top card to center)
    }
  }

  // Pointer drag for real-time circular wheel movement
  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (cards.length <= 1 || isBusyRef.current) return;
    dragStartY.current = e.clientY;
    setIsDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (cards.length <= 1) return;

    if (isDragging && dragStartY.current !== null) {
      const dy = e.clientY - dragStartY.current;
      setDragY(dy);
      return;
    }

    // Hover 3D perspective tilt on the primary center card
    const el = cardContainerRef.current;
    if (!el || isBusyRef.current || isTransitioning) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const rotateX = (-y / rect.height) * 8;
    const rotateY = (x / rect.width) * 8;
    setTilt({ x: rotateX, y: rotateY });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    if (!isDragging) return;
    setIsDragging(false);
    dragStartY.current = null;

    if (dragY < -35) {
      // Pushed UP -> card below comes to primary place!
      triggerRotate(1);
    } else if (dragY > 35) {
      // Moved DOWN -> card above comes to primary place!
      triggerRotate(-1);
    } else {
      // Snap back smoothly to center
      setIsTransitioning(true);
      setDragY(0);
      setTimeout(() => {
        setIsTransitioning(false);
      }, 240);
    }
  }

  function handlePointerLeave() {
    if (!isDragging && !isTransitioning) {
      setTilt({ x: 0, y: 0 });
    }
  }

  const transitionCss = isDragging
    ? "none"
    : "transform 340ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 340ms ease-out";

  return (
    <div className="space-y-6">
      {/* =========================================================
          TOP SECTION: Total Card Outstanding & Revolving Summary
      ========================================================= */}
      <section className="aura-card-obsidian relative overflow-hidden rounded-[2.5rem] p-6 sm:p-8 shadow-2xl backdrop-blur-2xl">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative z-10 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 font-mono">
                TOTAL CARD OUTSTANDING
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsTotalMasked(!isTotalMasked)}
                className="text-slate-400 hover:text-white transition-colors p-1"
                title={isTotalMasked ? "Show Amount" : "Hide Amount"}
              >
                {isTotalMasked ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
              <Badge variant="amber" className="px-3 py-1 font-mono text-[11px]">
                {overallUtilization}% TOTAL UTILIZATION
              </Badge>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <div className="text-4xl sm:text-6xl font-black tracking-tight text-white tabular-nums drop-shadow-md">
                {isTotalMasked
                  ? "••••••••"
                  : canCalculateBalances
                  ? formatRupees(totalOutstandingPaise)
                  : "Unavailable"}
              </div>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-400 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                <span>
                  {cards.length} {cards.length === 1 ? "credit card" : "credit cards"} integrated
                  across banking lines
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <Link
                href="/cards/activity"
                className="rounded-full bg-white/10 hover:bg-white/20 border border-white/15 px-4 py-2 text-xs font-bold text-white transition-all shadow-sm flex items-center gap-1.5"
              >
                <span>Card Activity</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
              <a
                href="#add-card-form"
                className="rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-md shadow-amber-500/20 hover:brightness-110 transition-all flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Card</span>
              </a>
            </div>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="flex justify-between text-xs font-semibold text-slate-400">
              <span>Overall Credit Utilization</span>
              <span
                className={
                  overallUtilization > 50
                    ? "text-rose-400 font-bold"
                    : overallUtilization > 30
                    ? "text-amber-400 font-bold"
                    : "text-emerald-400 font-bold"
                }
              >
                {overallUtilization}% of total limit
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  overallUtilization > 70
                    ? "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]"
                    : overallUtilization > 35
                    ? "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                    : "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.6)]"
                }`}
                style={{ width: `${Math.max(2, overallUtilization)}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3.5 border-t border-white/10 pt-4">
            <div className="rounded-2xl border border-white/5 bg-white/5 p-3.5 backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Combined Limit
              </p>
              <p className="mt-1 text-lg sm:text-xl font-black text-white tabular-nums">
                {formatRupees(totalLimitPaise)}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3.5 backdrop-blur-md">
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Available Credit
              </p>
              <p className="mt-1 text-lg sm:text-xl font-black text-emerald-300 tabular-nums">
                {canCalculateBalances
                  ? formatRupees(totalAvailablePaise)
                  : "Unavailable"}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================
          MIDDLE SECTION: True 3D Circular Wheel (Above & Below Deck)
      ========================================================= */}
      {cards.length === 0 ? (
        <section className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-10 text-center backdrop-blur-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/30">
            <CreditCard className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-bold text-white">
            No credit cards added yet
          </h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
            Add your primary institutional credit cards to track billing schedules, statement dues, and dynamic limits.
          </p>
          <a
            href="#add-card-form"
            className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 hover:brightness-110 transition-all shadow-lg shadow-amber-500/20"
          >
            <Plus className="h-4 w-4" />
            <span>Add Your First Card</span>
          </a>
        </section>
      ) : (
        <section className="space-y-4">
          {/* Header row with circular indicators */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
              <h2 className="text-sm sm:text-base font-bold tracking-tight text-white">
                Physical Cards Stack ({cards.length})
              </h2>
              <span className="text-xs text-slate-400 font-mono">
                Card {selectedIndex + 1} of {cards.length}
              </span>
            </div>

            {cards.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400 hidden sm:inline mr-1">
                  Push up or pull down to cycle
                </span>
                <button
                  type="button"
                  onClick={() => triggerRotate(-1)}
                  className="p-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-white transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
                  aria-label="Previous card (card above)"
                  title="Card Above"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => triggerRotate(1)}
                  className="p-1.5 rounded-full bg-white/5 border border-white/10 text-slate-300 hover:text-white transition-all hover:bg-white/10 active:scale-95 cursor-pointer"
                  aria-label="Next card (card below)"
                  title="Card Below"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          {/* =========================================================
              THE 3D VERTICAL CIRCULAR WHEEL
              Cards are arranged in a continuous cylinder: Above, Primary, Below
          ========================================================= */}
          <div
            ref={cardContainerRef}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            className="relative w-full min-h-[480px] sm:min-h-[520px] flex items-center justify-center select-none cursor-grab active:cursor-grabbing touch-none py-10 overflow-visible"
            style={{ perspective: 1200, transformStyle: "preserve-3d" }}
          >
            {cards.map((card, idx) => {
              const theme = CARD_THEMES[idx % CARD_THEMES.length];
              const cardBrand = resolveCardBrand(card.card_network, card.name, card.bank_name);
              const isLightCard = theme.name === "Auric Reserve";

              // =========================================================
              // Calculate Continuous Position on the 3D Vertical Cylinder
              // dragSlot: displacement in slot units (-150px = +1 rotation)
              // =========================================================
              const dragSlot = -dragY / 150;
              let d = (idx - selectedIndex) - dragSlot;

              // Circular wrap around the vertical cylinder
              const N = cards.length;
              if (N === 4) {
                // For N = 4: distributes cards above (-2, -1), center (0), below (+1)
                while (d > 1.8) d -= 4;
                while (d < -2.2) d += 4;
              } else {
                const half = N / 2;
                while (d > half) d -= N;
                while (d < -half) d += N;
              }

              const absD = Math.abs(d);
              const isPrimary = absD < 0.35;
              const isAbove = d <= -0.35;

              let translateY = 0;
              let translateZ = 0;
              let rotateX = 0;
              let scale = 1;
              let opacity = 1;
              let zIndex = 10;

              if (isPrimary) {
                translateY = d * 80;
                translateZ = -absD * 50;
                rotateX = d * 16 + (isDragging || isTransitioning ? 0 : tilt.x);
                scale = 1 - absD * 0.1;
                opacity = 1 - absD * 0.12;
                zIndex = 30;
              } else if (isAbove) {
                // Cards peeking above the primary card
                if (d >= -1.2) {
                  // Upper card (d ≈ -1)
                  const t = (-d - 0.35) / (1.2 - 0.35);
                  translateY = -28 - t * 48; // -28px -> -76px
                  translateZ = -18 - t * 32; // -18px -> -50px
                  rotateX = -6 - t * 10;     // -6deg -> -16deg
                  scale = 0.96 - t * 0.07;   // 0.96 -> 0.89
                  opacity = 0.95 - t * 0.08; // 0.95 -> 0.87
                  zIndex = 20;
                } else {
                  // Topmost card (d ≈ -2)
                  const t = Math.min(1, (-d - 1.2) / 1.0);
                  translateY = -76 - t * 60; // -76px -> -136px
                  translateZ = -50 - t * 40; // -50px -> -90px
                  rotateX = -16 - t * 10;    // -16deg -> -26deg
                  scale = 0.89 - t * 0.10;   // 0.89 -> 0.79
                  opacity = Math.max(0, 0.87 - t * 0.22); // 0.87 -> 0.65 -> 0
                  zIndex = 10;
                }
              } else {
                // Cards peeking below the primary card
                if (d <= 1.2) {
                  // Lower card (d ≈ +1)
                  const t = (d - 0.35) / (1.2 - 0.35);
                  translateY = 28 + t * 52;  // +28px -> +80px
                  translateZ = -18 - t * 32; // -18px -> -50px
                  rotateX = 6 + t * 10;      // +6deg -> +16deg
                  scale = 0.96 - t * 0.07;   // 0.96 -> 0.89
                  opacity = 0.95 - t * 0.08; // 0.95 -> 0.87
                  zIndex = 20;
                } else {
                  // Bottommost card (d ≈ +2)
                  const t = Math.min(1, (d - 1.2) / 1.0);
                  translateY = 80 + t * 60;  // +80px -> +140px
                  translateZ = -50 - t * 40; // -50px -> -90px
                  rotateX = 16 + t * 10;     // +16deg -> +26deg
                  scale = 0.89 - t * 0.10;   // 0.89 -> 0.79
                  opacity = Math.max(0, 0.87 - t * 0.22); // 0.87 -> 0.65 -> 0
                  zIndex = 10;
                }
              }

              const rotateY = isPrimary && !isDragging && !isTransitioning ? tilt.y : 0;

              return (
                <div
                  key={card.id}
                  onClick={() => {
                    if (idx !== selectedIndex) {
                      handleSelectCard(idx);
                    }
                  }}
                  style={{
                    ...theme.bgStyle,
                    transform: `perspective(1200px) translateY(${translateY}px) translateZ(${translateZ}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(${scale})`,
                    opacity,
                    zIndex,
                    transition: transitionCss,
                  }}
                  className={`absolute w-full aspect-[1.586/1] max-w-lg rounded-2xl p-5 sm:p-6 shadow-2xl flex flex-col justify-between overflow-hidden border ${
                    theme.className
                  } ${!isPrimary ? "cursor-pointer hover:brightness-110" : ""}`}
                >
                  {/* Atmospheric Specular Reflection */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-white/[0.08] pointer-events-none" />
                  <div
                    className="absolute -right-16 -top-16 w-48 h-48 rounded-full blur-2xl pointer-events-none"
                    style={{ backgroundColor: theme.glowColor }}
                  />

                  {/* Card Top: Chip, Contactless, Bank & Monogram */}
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {/* Brushed Brass EMV Chip */}
                      <div
                        className={`w-8 h-6 sm:w-9 sm:h-7 rounded-sm bg-gradient-to-br ${theme.chipBg} p-0.5 shadow-inner flex flex-col justify-around border border-black/20`}
                      >
                        <div
                          className="w-full h-px"
                          style={{ backgroundColor: theme.chipLines }}
                        />
                        <div
                          className="w-full h-px"
                          style={{ backgroundColor: theme.chipLines }}
                        />
                        <div
                          className="w-full h-px"
                          style={{ backgroundColor: theme.chipLines }}
                        />
                      </div>
                      {/* Contactless Waves Glyph */}
                      <span
                        className={`text-xs font-mono tracking-widest hidden sm:inline ${
                          isLightCard ? "text-[#2c1d02]/80" : "text-[#bbcabf]"
                        }`}
                      >
                        )))
                      </span>
                      <span
                        className={`text-xs font-bold tracking-wide truncate max-w-[110px] sm:max-w-[150px] ${
                          isLightCard ? "text-[#2c1d02]" : "text-white/95"
                        }`}
                      >
                        {card.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full border backdrop-blur-sm ${
                          isLightCard
                            ? "border-[#2c1d02]/20 bg-[#2c1d02]/10 text-[#2c1d02]"
                            : "border-white/20 bg-white/10 text-slate-200"
                        }`}
                      >
                        {card.bank_name}
                      </span>
                      {renderBrandMonogram(cardBrand, isLightCard)}
                    </div>
                  </div>

                  {/* Card Mid: Dynamic Valuation / Card Outstanding */}
                  <div className="relative z-10 my-auto pt-2">
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[11px] tracking-wider uppercase font-medium flex items-center gap-1.5 ${
                          isLightCard ? "text-[#2c1d02]/80" : "text-[#bbcabf]"
                        }`}
                      >
                        <span>Total Card Outstanding</span>
                        {isPrimary && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsCardMasked(!isCardMasked);
                            }}
                            className={`hover:opacity-100 transition-opacity ${
                              isLightCard
                                ? "text-[#2c1d02]"
                                : "text-[#bbcabf] hover:text-white"
                            }`}
                            title={isCardMasked ? "Show Amount" : "Hide Amount"}
                          >
                            {isCardMasked ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                      </span>

                      {/* Status Pill */}
                      {card.outstandingPaise === 0 ? (
                        <div className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>NO DUES</span>
                        </div>
                      ) : (
                        <div
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            isLightCard
                              ? "bg-[#2c1d02]/15 text-[#2c1d02]"
                              : "bg-emerald-400/15 text-[#4edea3]"
                          }`}
                        >
                          <TrendingUp className="h-3 w-3" />
                          <span>{card.utilizationPct}% used</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-1 flex items-baseline gap-2">
                      <span
                        className={`text-3xl sm:text-4xl md:text-5xl font-black tracking-tight tabular-nums ${
                          isLightCard ? "text-[#2c1d02]" : "text-white"
                        }`}
                      >
                        {isPrimary && isCardMasked
                          ? "••••••••••••"
                          : formatRupees(card.outstandingPaise)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className={`text-xs font-mono ${
                          isLightCard ? "text-[#2c1d02]/80" : "text-[#bbcabf]"
                        }`}
                      >
                        {card.name}
                      </span>
                      <span
                        className={
                          isLightCard ? "text-[#2c1d02]/40" : "text-[#bbcabf]/40"
                        }
                      >
                        •
                      </span>
                      <span
                        className={`text-xs ${
                          isLightCard ? "text-[#2c1d02]/80" : "text-[#bbcabf]"
                        }`}
                      >
                        Limit {formatRupees(card.credit_limit_paise)}
                      </span>
                      {card.payment_due_day !== null && (
                        <>
                          <span
                            className={
                              isLightCard
                                ? "text-[#2c1d02]/40"
                                : "text-[#bbcabf]/40"
                            }
                          >
                            •
                          </span>
                          <span
                            className={`text-[11px] font-mono uppercase font-bold ${
                              isLightCard ? "text-[#2c1d02]" : "text-[#4edea3]"
                            }`}
                          >
                            Due {ordinalDay(card.payment_due_day)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom: Cardholder, Digits & Action Pill */}
                  <div
                    className={`relative z-10 flex items-end justify-between pt-1 border-t ${
                      isLightCard ? "border-[#2c1d02]/15" : "border-white/10"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span
                        className={`text-[9px] tracking-wider uppercase font-medium ${
                          isLightCard ? "text-[#2c1d02]/70" : "text-[#bbcabf]/70"
                        }`}
                      >
                        {card.bank_name} • {card.name}
                      </span>
                      <span
                        className={`text-xs sm:text-sm tracking-wide font-semibold uppercase truncate max-w-[150px] sm:max-w-[200px] ${
                          isLightCard ? "text-[#2c1d02]" : "text-white"
                        }`}
                      >
                        {card.cardholder_name || cardholderName || "Not set"}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end">
                        <span
                          className={`font-mono text-xs tracking-widest ${
                            isLightCard ? "text-[#2c1d02]/90" : "text-[#bbcabf]"
                          }`}
                        >
                          •••• {card.last_four_digits || "4920"}
                        </span>
                        <span
                          className={`font-mono text-[10px] ${
                            isLightCard ? "text-[#2c1d02]/60" : "text-[#bbcabf]/60"
                          }`}
                        >
                          {card.statement_day
                            ? `STMT ${ordinalDay(card.statement_day)}`
                            : "ACTIVE"}
                        </span>
                      </div>

                      {isPrimary ? (
                        <Link
                          href={card.outstandingPaise === 0 ? `/transactions/new?type=expense&card_id=${card.id}` : `/cards/activity?card_id=${card.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`rounded-full px-3 py-1 text-[11px] font-bold transition-all shadow-sm flex items-center gap-1 active:scale-95 ${
                            isLightCard
                              ? "bg-[#2c1d02] text-amber-100 hover:bg-[#3d2904]"
                              : "bg-white/15 hover:bg-white/25 text-white border border-white/20"
                          }`}
                        >
                          <span>
                            {card.outstandingPaise === 0 ? "Spend" : "Pay"}
                          </span>
                          <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span
                          className={`text-[11px] font-bold font-mono tracking-tight px-2 py-0.5 rounded-md ${
                            isLightCard
                              ? "bg-[#2c1d02]/10 text-[#2c1d02]"
                              : "bg-white/10 text-slate-200"
                          }`}
                        >
                          {formatRupees(card.outstandingPaise)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick card switcher thumbnails */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto py-2 px-1 scrollbar-none border-t border-white/10 pt-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0 mr-1">
                ALL ({cards.length}):
              </span>
              {cards.map((card, idx) => {
                const isSelected = idx === selectedIndex;
                const theme = CARD_THEMES[idx % CARD_THEMES.length];

                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => {
                      if (idx !== selectedIndex) {
                        handleSelectCard(idx);
                      }
                    }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all shrink-0 cursor-pointer ${
                      isSelected
                        ? "border-amber-400 bg-amber-400/15 text-amber-200 shadow-md shadow-amber-500/10 ring-1 ring-amber-400/40"
                        : "border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: theme.accentColor }}
                    />
                    <span className="font-medium">{card.bank_name}</span>
                    {card.card_network && (
                      <span className="text-[10px] text-amber-300/90 font-bold">
                        {card.card_network}
                      </span>
                    )}
                    <span className="font-mono text-[10px] text-slate-400">
                      ••{card.last_four_digits ? card.last_four_digits.slice(-2) : "••"}
                    </span>
                  </button>
                );
              })}
            </div>

            <a
              href="#add-card-form"
              className="flex items-center gap-1 px-3 py-1.5 rounded-full border border-dashed border-white/20 bg-white/5 text-xs font-semibold text-slate-300 hover:text-white hover:border-amber-400/50 transition-all shrink-0 ml-auto"
            >
              <Plus className="h-3.5 w-3.5 text-amber-400" />
              <span>Add Card</span>
            </a>
          </div>

          {/* =========================================================
              BOTTOM SECTION: Selected Card Deep Dive & Activity
          ========================================================= */}
          {selectedCard && (
            <div className="space-y-6 pt-3">
              {/* Card Details & Utilization Grid */}
              <div className="aura-panel rounded-3xl p-6 sm:p-7 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full animate-pulse"
                        style={{
                          backgroundColor:
                            CARD_THEMES[selectedIndex % CARD_THEMES.length].accentColor,
                        }}
                      />
                      <h3 className="text-base sm:text-lg font-bold tracking-tight text-white">
                        {selectedCard.name}
                      </h3>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold tracking-wider border-white/20 bg-white/5 text-slate-300"
                      >
                        {selectedCard.bank_name}
                      </Badge>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold tracking-wider border-amber-400/30 bg-amber-400/10 text-amber-300"
                      >
                        {selectedCard.card_network || "Network: Not set"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400 font-mono">
                      Card Ending in {selectedCard.last_four_digits || "••••"} · Detailed Telemetry
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/transactions/new?type=expense&card_id=${selectedCard.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs font-bold transition-all shadow-sm active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Spend</span>
                    </Link>
                    <Link
                      href={`/cards/activity?card_id=${selectedCard.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-xs font-semibold transition-all shadow-sm active:scale-95"
                    >
                      <span>Repay</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>

                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur-md">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Total Card Outstanding
                    </span>
                    <div className="mt-1 text-2xl font-black text-white tabular-nums">
                      {formatRupees(selectedCard.outstandingPaise)}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {selectedCard.outstandingPaise === 0
                        ? "Zero dues outstanding"
                        : "Total current outstanding (unbilled + billed)"}
                    </span>
                  </div>

                  <div className={`rounded-2xl border p-4 backdrop-blur-md ${
                    selectedCard.availablePaise < 0
                      ? "border-rose-500/40 bg-rose-500/10"
                      : "border-emerald-500/20 bg-emerald-500/10"
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${
                        selectedCard.availablePaise < 0 ? "text-rose-400" : "text-emerald-400"
                      }`}>
                        Available Limit
                      </span>
                      {selectedCard.availablePaise < 0 && (
                        <Badge className="bg-rose-500/20 text-rose-300 text-[9px] font-bold border-rose-500/30 px-1.5 py-0.5">
                          OVER LIMIT
                        </Badge>
                      )}
                    </div>
                    <div className={`mt-1 text-2xl font-black tabular-nums ${
                      selectedCard.availablePaise < 0 ? "text-rose-300" : "text-emerald-300"
                    }`}>
                      {formatRupees(selectedCard.availablePaise)}
                    </div>
                    <span className={`text-[11px] ${
                      selectedCard.availablePaise < 0 ? "text-rose-400/90 font-medium" : "text-emerald-400/70"
                    }`}>
                      {selectedCard.availablePaise < 0
                        ? `Exceeded by ${formatRupees(Math.abs(selectedCard.availablePaise))}`
                        : "Remaining institutional line"}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-white/5 bg-white/5 p-4 backdrop-blur-md">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Assigned Limit
                    </span>
                    <div className="mt-1 text-2xl font-black text-white tabular-nums">
                      {formatRupees(selectedCard.credit_limit_paise)}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Maximum credit limit
                    </span>
                  </div>
                </div>

                {/* Live Card Utilization Meter */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-400">
                    <span>Card Limit Utilization</span>
                    <span
                      className={
                        selectedCard.utilizationPct > 50
                          ? "text-rose-400 font-bold"
                          : selectedCard.utilizationPct > 30
                          ? "text-amber-400 font-bold"
                          : "text-emerald-400 font-bold"
                      }
                    >
                      {selectedCard.utilizationPct}% used
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        selectedCard.utilizationPct > 70
                          ? "bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.6)]"
                          : selectedCard.utilizationPct > 30
                          ? "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.6)]"
                          : "bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.6)]"
                      }`}
                      style={{ width: `${Math.max(2, selectedCard.utilizationPct)}%` }}
                    />
                  </div>
                </div>

                {/* Cardholder Name and Network Identification */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-300">
                      <User className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Name on Card
                      </p>
                      <p className="text-sm font-bold text-white uppercase truncate">
                        {selectedCard.cardholder_name || "Not set"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 backdrop-blur-md">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
                      <CreditCard className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                        Card Network
                      </p>
                      <p className="text-sm font-bold text-white truncate">
                        {selectedCard.card_network || "Not set"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Statement and Due Date schedule pills */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/5 text-slate-300">
                      <Clock className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Statement Generation Day
                      </p>
                      <p className="text-sm font-bold text-white">
                        {ordinalDay(selectedCard.statement_day)} of every month
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 backdrop-blur-md">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
                      <Calendar className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                        Payment Due Day
                      </p>
                      <p className="text-sm font-bold text-emerald-300">
                        {ordinalDay(selectedCard.payment_due_day)} of every month
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactions / Activity for this specific card */}
              <div className="aura-panel rounded-3xl p-6 sm:p-7 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm sm:text-base font-bold text-white">
                      Recent Activity · {selectedCard.name}
                    </h4>
                    <span className="text-xs text-slate-400 font-mono">
                      ({cardTransactions.length})
                    </span>
                  </div>

                  <Link
                    href="/cards/activity"
                    className="text-xs font-semibold text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1"
                  >
                    <span>View all activity</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </div>

                {cardTransactions.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center">
                    <ShoppingBag className="mx-auto h-8 w-8 text-slate-500" />
                    <p className="mt-2 text-sm font-semibold text-slate-300">
                      No transactions recorded for this card yet
                    </p>
                    <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                      Log your card spends and bill repayments to track utilization in real time.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                      <Link
                        href={`/transactions/new?type=expense&card_id=${selectedCard.id}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 text-xs font-bold transition-all active:scale-95"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Record Spend</span>
                      </Link>
                      <Link
                        href={`/cards/activity?card_id=${selectedCard.id}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 text-xs font-medium transition-all active:scale-95"
                      >
                        <span>Card Repayment</span>
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 rounded-2xl border border-white/5 bg-white/[0.02] overflow-hidden">
                    {cardTransactions.slice(0, 10).map((tx) => {
                      const isPurchase = tx.transaction_type === "card_purchase";

                      return (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-4 transition-colors hover:bg-white/[0.04]"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                                isPurchase
                                  ? "bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/30"
                                  : "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30"
                              }`}
                            >
                              {isPurchase ? (
                                <ShoppingBag className="h-4 w-4" />
                              ) : (
                                <Wallet className="h-4 w-4" />
                              )}
                            </div>
                            <div>
                              <p className="text-xs sm:text-sm font-semibold text-white">
                                {tx.description ||
                                  (isPurchase ? "Card Purchase" : "Bill Settlement")}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {formatDate(tx.transaction_date)} ·{" "}
                                {isPurchase ? "Card Spend" : "Bill Repayment"}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <div
                              className={`text-sm sm:text-base font-bold tabular-nums ${
                                isPurchase ? "text-slate-200" : "text-emerald-400"
                              }`}
                            >
                              {isPurchase ? "- " : "+ "}
                              {formatRupees(tx.amount_paise)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
