import { redirect } from "next/navigation";

import { getJoinPageRedirect } from "@/lib/join-path";
import { getSession } from "@/server/better-auth/server";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getSession();
  redirect(
    getJoinPageRedirect({
      hasSession: Boolean(session?.user),
      locale,
    }),
  );
}
