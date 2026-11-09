"use client";

import React, { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

type Theme = "dark" | "light" | "system";

interface ThemeContextType {
  theme: Theme;
  resolvedTheme: "dark" | "light";
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function subscribeSystemTheme(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSystemThemeSnapshot(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getSystemThemeServerSnapshot(): "dark" | "light" {
  return "dark";
}

function subscribeMounted() {
  return () => {};
}

function getMountedSnapshot() {
  return true;
}

function getMountedServerSnapshot() {
  return false;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const isMounted = useSyncExternalStore(subscribeMounted, getMountedSnapshot, getMountedServerSnapshot);
  const systemTheme = useSyncExternalStore(subscribeSystemTheme, getSystemThemeSnapshot, getSystemThemeServerSnapshot);

  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    try {
      const saved = localStorage.getItem("aura-theme") as Theme | null;
      if (saved && (saved === "dark" || saved === "light" || saved === "system")) {
        return saved;
      }
    } catch {
      // LocalStorage unavailable
    }
    return "dark";
  });

  const resolvedTheme: "dark" | "light" = theme === "system" ? systemTheme : theme;

  useEffect(() => {
    if (!isMounted) return;
    const root = document.documentElement;

    if (resolvedTheme === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    }
  }, [resolvedTheme, isMounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem("aura-theme", newTheme);
    } catch {
      // Ignore
    }
  };

  const toggleTheme = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    // Graceful fallback for components rendered outside provider
    return {
      theme: "dark" as Theme,
      resolvedTheme: "dark" as const,
      setTheme: () => {},
      toggleTheme: () => {},
    };
  }
  return context;
}

export function ThemeToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { resolvedTheme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
      className={`group relative inline-flex items-center justify-center rounded-xl p-2 transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4edea3] active:scale-95 ${
        resolvedTheme === "dark"
          ? "bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.15)]"
          : "bg-black/[0.04] hover:bg-black/[0.08] border border-black/10 text-emerald-700 shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
      } ${className}`}
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:rotate-45 text-amber-300" />
      ) : (
        <Moon className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:-rotate-12 text-slate-700" />
      )}
      {!compact && (
        <span className="ml-2 text-xs font-semibold tracking-wide hidden sm:inline">
          {resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}
        </span>
      )}
    </button>
  );
}
