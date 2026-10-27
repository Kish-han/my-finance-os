import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "emerald" | "amber" | "rose" | "cyan" | "outline";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  const variantStyles = {
    default:
      "bg-white/10 text-slate-200 border-white/10",
    emerald:
      "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 shadow-[0_0_15px_-3px_rgba(16,185,129,0.3)]",
    amber:
      "bg-amber-500/10 text-amber-300 border-amber-500/30 shadow-[0_0_15px_-3px_rgba(245,158,11,0.3)]",
    rose:
      "bg-rose-500/10 text-rose-300 border-rose-500/30 shadow-[0_0_15px_-3px_rgba(244,63,94,0.3)]",
    cyan:
      "bg-cyan-500/10 text-cyan-300 border-cyan-500/30 shadow-[0_0_15px_-3px_rgba(6,182,212,0.3)]",
    outline:
      "border-white/20 text-slate-300 bg-transparent",
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
