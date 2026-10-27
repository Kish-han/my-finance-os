import type { ReactNode } from "react";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { logout } from "../login/actions";
import { EmiSubNav } from "./EmiSubNav";

export default function EmiLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 selection:bg-cyan-500/30 selection:text-cyan-200 overflow-hidden">
      {/* Dynamic ambient atmospheric lighting */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-cyan-500/10 blur-[150px] animate-pulse-glow" />
      <div
        className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#10b981]/10 blur-[160px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-[#8b5cf6]/10 blur-[140px] animate-pulse-glow"
        style={{ animationDelay: "4s" }}
      />

      {/* Stitch Executive Header */}
      <AuraHeader
        sectionTitle="Debt & Loans"
        signOutAction={logout}
      />

      {/* Dynamic Path-Aware Sub-navigation */}
      <EmiSubNav />

      <div>
        {children}
      </div>

      {/* Stitch Floating Dock */}
      <AuraBottomNav />
    </div>
  );
}
