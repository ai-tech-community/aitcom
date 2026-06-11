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

  // Look up the hackathon event bound to this challenge (1:1-optional).
  // Match the public event status filter used on the event detail page.
  const { docs: eventDocs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { challengeId: { equals: String(challenge.id) } },
        { status: { not_in: ["draft", "rejected"] } },
      ],
    },
    limit: 1,
    depth: 0,
  });

  const boundEvent = eventDocs[0] ?? null;
  const hackathonEvent = boundEvent
    ? {
        slug: boundEvent.slug as string,
        title: boundEvent.title as string,
      }
    : null;

  return (
    <HydrateClient>
      <ChallengeDetailContent
        challenge={JSON.parse(JSON.stringify(challenge))}
        hackathonEvent={hackathonEvent}
      />
    </HydrateClient>
  );
}
