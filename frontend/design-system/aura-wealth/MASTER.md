# Design System Master File — AURA Wealth OS

> **LOGIC:** When building or refining a specific page, first check `design-system/aura-wealth/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** AURA Wealth — Private Financial Operating System  
**Category:** Modern Executive Fintech / Wealth & Debt Ledger  
**Theme:** Obsidian Wealth Glassmorphism  
**Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide Icons  

---

## 1. Visual Hierarchy & Surface Architecture

### Elevation & Layer Tokens

| Tier | Role | Hex / Gradient | Border | Backdrop Blur |
|------|------|----------------|--------|---------------|
| **L0: Canvas** | Body Background | `#10141a` | None | None |
| **L1: Substrate** | Grid / Section background | `#141820` / `rgba(20,24,32,0.85)` | `rgba(255,255,255,0.06)` | `16px` |
| **L2: Card / Panel** | Default content card (`aura-panel`) | `rgba(24, 28, 34, 0.75)` | `rgba(255,255,255,0.08)` | `24px` |
| **L3: Hero / Obsidian** | Flagship card (`aura-card-obsidian`) | `linear-gradient(135deg, #171c24 0%, #0b0e14 60%, #141922 100%)` | `rgba(255,255,255,0.12)` | `24px` |
| **L4: Floating Chrome** | Top Header & Bottom Dock (`aura-dock`) | `rgba(28, 32, 38, 0.85)` | `rgba(255,255,255,0.14)` | `32px` |
| **L5: Modals / Popovers** | Form dialogs, action sheets | `#181c22` | `rgba(255,255,255,0.16)` | `32px` |

---

## 2. Colour System (Fintech Semantics)

| Role | Semantic Meaning | Foreground / Accent | Background / Chip | Border |
|------|------------------|---------------------|-------------------|--------|
| **Primary Wealth** | Net Worth, Assets, Savings | `#4edea3` / `#10b981` (Emerald) | `rgba(16,185,129,0.12)` | `rgba(16,185,129,0.28)` |
| **Inflow / Credit** | Income, Deposits | `#4edea3` / `#34d399` | `rgba(78,222,163,0.10)` | `rgba(78,222,163,0.25)` |
| **Outflow / Debit** | Expenses, Fees, Charges | `#ff7886` / `#ef4444` (Rose) | `rgba(239,68,68,0.10)` | `rgba(239,68,68,0.25)` |
| **Internal Transfer** | Account-to-Account movements | `#22d3ee` / `#06b6d4` (Cyan) | `rgba(6,182,212,0.10)` | `rgba(6,182,212,0.25)` |
| **Revolving Credit** | Credit Cards, Utilization, Dues | `#fbb24a` / `#f59e0b` (Amber/Gold) | `rgba(245,158,11,0.10)` | `rgba(245,158,11,0.25)` |
| **Amortized Debt** | Term Loans, EMIs, Schedules | `#d0bcff` / `#8b5cf6` (Amethyst) | `rgba(139,92,246,0.10)` | `rgba(139,92,246,0.25)` |
| **Neutral Foreground** | Primary Headings & Totals | `#ffffff` / `#f8fafc` | — | — |
| **Muted Text** | Subtitles, Field Labels, Captions | `#94a3b8` / `#bbcabf` (>= 4.5:1) | — | — |

---

## 3. Typography & Numerical Precision

- **Primary Sans:** `Plus Jakarta Sans` (`--font-plus-jakarta-sans`, weights 400, 500, 600, 700, 800)
- **Financial Monospace:** `Geist Mono` (`--font-geist-mono`) for dates, rates (bps), IDs, and raw amounts.
- **Tabular Figures Requirement:**
  Every currency amount (`₹...`) must be wrapped with `.tabular-nums` (`font-feature-settings: "tnum" 1`) to guarantee zero layout shifts during state changes or counter transitions.

### Typographic Scale

| Tier | Size | Weight | Tracking | Usage |
|------|------|--------|----------|-------|
| **Display Hero** | `text-4xl` to `text-6xl` | `font-black` (800/900) | `tracking-tight` | Net worth hero total |
| **Card Header** | `text-xl` to `text-2xl` | `font-bold` (700) | `tracking-tight` | Section balance figures |
| **Section Title** | `text-xs` / `text-sm` | `font-bold` (700) | `tracking-wider uppercase` | Section badges and grouping headers |
| **Body Primary** | `text-sm` (14px) | `font-medium` (500) | `tracking-normal` | List row labels, transaction descriptions |
| **Caption / Meta** | `text-[11px]` to `text-xs` | `font-medium` (500) | `tracking-wide` | Dates, institutions, account types |

---

## 4. Responsive Design & Touch Ergonomics

- **Minimum Tap Target:** `44 × 44 pt` (iOS) / `48 × 48 dp` (Android) on all interactive icons and pills.
- **Safe Area Insets:** Fixed header uses `pt-[env(safe-area-inset-top,0px)]`; bottom dock uses `pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]`.
- **Bottom Dock Ergonomics:** Bottom navigation must never exceed 5 primary touch anchors on small screens to prevent crowded or mistapped controls.
- **Table / List Scrolling:** Use full-bleed responsive cards on mobile instead of unpadded, horizontally cropped desktop tables.
- **Form Inputs:** Input heights `>= 46px` on mobile with `text-base` font size to prevent iOS Safari auto-zoom on focus.

---

## 5. Micro-Interactions & Accessibility

- **Feedback Speed:** Tap/hover response within 100–150ms (`transition-all duration-200 active:scale-[0.98]`).
- **Focus Rings:** Visible high-contrast focus rings: `focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none`.
- **Motion Reduction:** Wrap floating animations in `@media (prefers-reduced-motion: no-preference)` to respect user vestibular preferences.
- **Color Independence:** Always accompany color indications with icons or explicit status copy (e.g. `+` for income, `−` for expense, badge text).

---

## 6. Pre-Delivery Checklist

- [x] No emoji as structural icons (Lucide vector icons only).
- [x] All clickable elements have `cursor-pointer` and active scale feedback.
- [x] Text contrast >= 4.5:1 against dark obsidian backgrounds.
- [x] `tabular-nums` on all currency values.
- [x] Tested across 360px mobile, 768px tablet, and 1280px desktop.
- [x] 100% passing tests without breaking financial invariants or calculations.
