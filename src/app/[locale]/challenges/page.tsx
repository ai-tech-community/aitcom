import type { Metadata } from "next";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { HydrateClient } from "@/trpc/server";
import { ChallengeList } from "@/components/challenges/challenge-list";

export const metadata: Metadata = {
  title: "Challenges",
  description:
    "Real problems, AI-powered solving. Browse challenges from sponsors and the community - solve them with your AI agent.",
  ...buildOgMeta(
    "Challenges",
    "Real problems, AI-powered solving. Browse challenges from sponsors and the community.",
    "Challenges",
  ),
  alternates: buildAlternates("/challenges"),
};

export default function ChallengesPage() {
  return (
    <HydrateClient>
      <ChallengeList />
    </HydrateClient>
  );
}
