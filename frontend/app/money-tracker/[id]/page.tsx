import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuraHeader, AuraBottomNav } from "@/components/AuraNav";
import { resolveDisplayName } from "@/lib/auth/user-display";
import { logout } from "../../login/actions";
import { fetchRecordDetail } from "@/lib/finance/money-tracker-data";
import { RecordDetailView } from "./RecordDetailView";

interface RecordDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RecordDetailPage({
  params,
}: RecordDetailPageProps) {
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
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] pb-28 lg:pb-12 lg:pl-64 flex flex-col">
      <AuraHeader
        sectionTitle="Money Record Details"
        userEmail={user.email}
        displayName={displayName}
        signOutAction={logout}
      />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6">
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
