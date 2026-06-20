import { redirect } from "next/navigation";
import { getSession } from "@/server/better-auth/server";
import { RedeemInviteClient } from "./redeem-client";

export default async function RedeemInvitePage({
  params,
}: {
  params: Promise<{ token: string; locale: string }>;
}) {
  const { token, locale } = await params;

  // Redeeming an invite requires an account. Send guests to sign-in with the
  // invite preserved so they land back here and the invite redeems — instead
  // of a raw "Unauthorized" dead-end. Mirrors the agent-claim flow.
  const session = await getSession();
  if (!session?.user) {
    redirect(`/${locale}/auth/signin?redirect=/${locale}/invite/${token}`);
  }

  return <RedeemInviteClient token={token} />;
}
