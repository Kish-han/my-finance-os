import { Suspense } from "react";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { logout } from "../../login/actions";
import { fetchRecordDetail } from "@/lib/finance/money-tracker-data";
import { RecordDetailView } from "./RecordDetailView";
import MoneyTrackerLoading from "../loading";

interface RecordDetailPageProps {
  params: Promise<{ id: string }>;
}

async function RecordDetailContent({ params }: RecordDetailPageProps) {
  await connection();
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = resolveDisplayName(user);

  const { record, repayments, balance, accounts } =
    await fetchRecordDetail(supabase, id);

  if (!record || !balance) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pt-20 pb-36 lg:pl-64 flex flex-col">
      <AuraHeader
        sectionTitle="Money Record Details"
        userEmail={user.email}
        displayName={displayName}
        signOutAction={logout}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 space-y-6">
        <RecordDetailView
          record={record}
          repayments={repayments}
          balance={balance}
          accounts={accounts}
        />
      </main>

      <AuraBottomNav />
    </div>
  );
}

export default function RecordDetailPage({ params }: RecordDetailPageProps) {
  return (
    <Suspense fallback={<MoneyTrackerLoading />}>
      <RecordDetailContent params={params} />
    </Suspense>
  );
}
