import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "emerald" | "amber" | "rose" | "cyan" | "purple" | "violet" | "outline";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variantStyles = {
    default:
      "bg-slate-200/80 dark:bg-white/10 text-slate-800 dark:text-slate-200 border-slate-300/80 dark:border-white/10",
    emerald:
      "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/25 shadow-[0_0_15px_-3px_rgba(16,185,129,0.25)]",
    amber:
      "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25 shadow-[0_0_15px_-3px_rgba(245,158,11,0.25)]",
    rose:
      "bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/25 shadow-[0_0_15px_-3px_rgba(244,63,94,0.25)]",
    cyan:
      "bg-cyan-500/10 text-cyan-800 dark:text-cyan-300 border-cyan-500/25 shadow-[0_0_15px_-3px_rgba(6,182,212,0.25)]",
    purple:
      "bg-purple-500/10 text-purple-800 dark:text-purple-300 border-purple-500/25 shadow-[0_0_15px_-3px_rgba(168,85,247,0.25)]",
    violet:
      "bg-violet-500/10 text-violet-800 dark:text-violet-300 border-violet-500/25 shadow-[0_0_15px_-3px_rgba(139,92,246,0.25)]",
    outline:
      "border-slate-300 dark:border-white/20 text-slate-700 dark:text-slate-300 bg-transparent",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase transition-colors",
        variantStyles[variant],
        className
      )}
      {...props}
    />
  );
}
