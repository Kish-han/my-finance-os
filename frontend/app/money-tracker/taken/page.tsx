import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { logout } from "../../login/actions";
import { fetchMoneyTrackerData } from "@/lib/finance/money-tracker-data";
import { MoneyTrackerFilteredView } from "../MoneyTrackerFilteredView";

export default async function MoneyTakenPage() {
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pb-28 lg:pb-12 lg:pl-64 flex flex-col">
      <AuraHeader
        sectionTitle="Money Taken"
        userEmail={user.email}
        displayName={displayName}
        signOutAction={logout}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6">
        <MoneyTrackerFilteredView
          mode="taken"
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
