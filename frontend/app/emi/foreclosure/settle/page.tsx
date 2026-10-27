import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";

async function SettleRedirect({
  searchParams,
}: {
  searchParams: Promise<{ debt_id?: string }>;
}): Promise<null> {
  await connection();
  const params = await searchParams;
  const target = params.debt_id
    ? `/emi/foreclosure?debt_id=${encodeURIComponent(params.debt_id)}`
    : "/emi/foreclosure";
  redirect(target);
  return null;
}

export default function SettlePage({
  searchParams,
}: {
  searchParams: Promise<{ debt_id?: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <SettleRedirect searchParams={searchParams} />
    </Suspense>
  );
}
