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
      "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold shadow-[0_0_25px_-5px_rgba(16,185,129,0.5)] border border-emerald-400/40",
    secondary:
      "bg-white/10 hover:bg-white/15 text-white border border-white/15 shadow-sm",
    outline:
      "border border-white/20 text-slate-200 hover:bg-white/5 hover:border-white/30",
    danger:
      "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30",
    ghost:
      "text-slate-400 hover:text-white hover:bg-white/5",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs rounded-xl",
    md: "px-4 py-2.5 text-sm rounded-xl",
    lg: "px-6 py-3.5 text-base rounded-2xl",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    />
  );
}
