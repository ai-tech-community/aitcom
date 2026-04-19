import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { HydrateClient } from "@/trpc/server";
import { ChallengeDetailContent } from "./content";

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "challenges",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });

  const challenge = docs[0];
  if (!challenge) notFound();

  return (
    <HydrateClient>
      <ChallengeDetailContent
        challenge={JSON.parse(JSON.stringify(challenge))}
      />
    </HydrateClient>
  );
}
