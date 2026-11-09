import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  const variantStyles = {
    primary:
      "bg-emerald-600 hover:bg-emerald-500 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-slate-950 font-bold shadow-[0_4px_20px_-4px_rgba(16,185,129,0.4)] border border-emerald-500/30",
    secondary:
      "bg-slate-200/80 hover:bg-slate-300/80 text-slate-900 border border-slate-300/70 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white dark:border-white/15 shadow-sm",
    outline:
      "border border-slate-300 hover:border-slate-400 text-slate-800 hover:bg-slate-100 dark:border-white/20 dark:text-slate-200 dark:hover:bg-white/5 dark:hover:border-white/30",
    danger:
      "bg-rose-500/15 text-rose-700 hover:bg-rose-500/25 border border-rose-500/30 dark:text-rose-300 dark:bg-rose-500/20 dark:hover:bg-rose-500/30",
    ghost:
      "text-slate-600 hover:text-slate-950 hover:bg-slate-200/50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-white/5",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs rounded-xl",
    md: "px-4 py-2.5 text-sm rounded-xl",
    lg: "px-6 py-3.5 text-base rounded-2xl",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10b981] dark:focus-visible:ring-[#4edea3] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
