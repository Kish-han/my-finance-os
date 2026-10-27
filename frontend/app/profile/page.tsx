import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { logout } from "../login/actions";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { ProfileView } from "./ProfileView";

async function ProfileContent() {
  await connection();

  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const displayName = resolveDisplayName(user);
  const email = user.email || "";

  return (
    <main className="min-h-screen bg-[#10141a] text-[#dfe2eb] pt-20 pb-36 relative overflow-hidden selection:bg-[#4edea3]/30 selection:text-[#4edea3]">
      {/* Obsidian Wealth ambient atmospheric lighting */}
      <div className="pointer-events-none fixed -left-32 top-10 h-96 w-96 rounded-full bg-[#10b981]/10 blur-[150px] animate-pulse-glow" />
      <div
        className="pointer-events-none fixed -right-32 top-1/4 h-[30rem] w-[30rem] rounded-full bg-[#8b5cf6]/10 blur-[160px] animate-pulse-glow"
        style={{ animationDelay: "2s" }}
      />
      <div
        className="pointer-events-none fixed bottom-10 left-1/3 h-80 w-80 rounded-full bg-amber-500/10 blur-[130px] animate-pulse-glow"
        style={{ animationDelay: "4s" }}
      />

      {/* Stitch Executive Header */}
      <AuraHeader
        sectionTitle="Profile & Settings"
        userEmail={email}
        displayName={displayName}
        signOutAction={logout}
      />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6">
        <ProfileView
          initialDisplayName={displayName}
          email={email}
          userId={user.id}
          createdAt={user.created_at}
          pendingNewEmail={user.new_email}
        />

        <p className="mt-12 text-center text-xs leading-5 text-slate-500">
          AURA Wealth · Private financial telemetry. Calculations computed idempotently from verified database records.
        </p>
      </div>

      {/* Floating Bottom Nav */}
      <AuraBottomNav />
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#10141a] p-6 text-slate-400">
          <div className="flex items-center gap-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#4edea3] border-t-transparent" />
            <p className="text-sm font-mono tracking-wider text-slate-300">
              Loading profile & security settings...
            </p>
          </div>
        </main>
      }
    >
      <ProfileContent />
    </Suspense>
  );
}
