import * as React from "react";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-3xl border border-dashed border-slate-300/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] backdrop-blur-xl",
        className
      )}
    >
      {Icon && (
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 mb-4 shadow-inner border border-emerald-500/20">
          <Icon className="h-7 w-7" />
        </div>
      )}
      <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5">
        {title}
      </h4>
      {description && (
        <p className="max-w-md text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
