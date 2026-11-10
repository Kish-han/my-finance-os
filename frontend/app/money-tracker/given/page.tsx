import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { logout } from "../../login/actions";
import { fetchMoneyTrackerData } from "@/lib/finance/money-tracker-data";
import { MoneyTrackerFilteredView } from "../MoneyTrackerFilteredView";
import MoneyTrackerLoading from "../loading";

async function MoneyGivenContent() {
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = resolveDisplayName(user);

  const data = await fetchMoneyTrackerData(supabase);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pt-20 pb-36 lg:pl-64 flex flex-col">
      <AuraHeader
        sectionTitle="Money Given"
        userEmail={user.email}
        displayName={displayName}
        signOutAction={logout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-6">
        <MoneyTrackerFilteredView
          mode="given"
          metrics={data.metrics}
          agreements={data.agreements}
          payments={data.payments}
          people={data.people}
          accounts={data.accounts}
        />
      </main>

      <AuraBottomNav />
    </div>
  );
}

export default function MoneyGivenPage() {
  return (
    <Suspense fallback={<MoneyTrackerLoading />}>
      <MoneyGivenContent />
    </Suspense>
  );
}
