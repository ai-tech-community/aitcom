import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { ClaimAgentClient } from "./claim-client";

export default async function ClaimPage({
  params,
}: {
  params: Promise<{ token: string; locale: string }>;
}) {
  const { token, locale } = await params;
  const session = await getSession();

  if (!session?.user) {
    redirect(`/${locale}/auth/signin?callbackUrl=/${locale}/claim/${token}`);
  }

  return <ClaimAgentClient token={token} locale={locale} />;
}
