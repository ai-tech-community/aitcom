import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { HydrateClient } from "@/trpc/server";
import { ChallengeList } from "@/components/challenges/challenge-list";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ChallengesPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <HydrateClient>
      <ChallengeList />
    </HydrateClient>
  );
}
