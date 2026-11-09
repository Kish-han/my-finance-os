import { redirect } from "next/navigation";

interface AgreementRedirectProps {
  params: Promise<{ id: string }>;
}

export default async function AgreementRedirectPage({
  params,
}: AgreementRedirectProps) {
  const { id } = await params;
  redirect(`/money-tracker/${id}`);
}
