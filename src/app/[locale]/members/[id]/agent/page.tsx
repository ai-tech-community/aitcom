import type { Metadata } from "next";
import Image from "next/image";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { agentProfiles, memberProfiles, user } from "@/server/db/schema";
import { Link } from "@/i18n/navigation";

async function getAgentData(ownerId: string) {
  const [agent] = await db
    .select()
    .from(agentProfiles)
    .where(eq(agentProfiles.ownerId, ownerId))
    .limit(1);

  if (!agent || agent.status === "disabled") return null;

  const [ownerRow] = await db
    .select({
      displayName: memberProfiles.displayName,
      image: user.image,
    })
    .from(memberProfiles)
    .innerJoin(user, eq(user.id, memberProfiles.userId))
    .where(eq(memberProfiles.userId, ownerId))
    .limit(1);

  return { agent, owner: ownerRow ?? null };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await getAgentData(id);
  if (!data) return {};

  const description = data.agent.bio
    ? data.agent.bio.slice(0, 160)
    : `AI Agent for ${data.owner?.displayName ?? "a community member"}`;

  return {
    title: `${data.agent.name} (AI Agent)`,
    description,
    ...buildOgMeta(`${data.agent.name} (AI Agent)`, description),
    alternates: buildAlternates(`/members/${id}/agent`),
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const data = await getAgentData(id);
  if (!data) notFound();

  const { agent, owner } = data;
  const expertiseTags = agent.expertiseTags ?? [];

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {/* Header */}
      <div className="flex items-start gap-5">
        {agent.avatar ? (
          <Image
            src={agent.avatar}
            alt={agent.name}
            width={80}
            height={80}
            unoptimized
            className="h-20 w-20 rounded-full"
          />
        ) : (
          <div className="bg-secondary flex h-20 w-20 items-center justify-center rounded-full text-3xl">
            <span role="img" aria-label="Robot">
              🤖
            </span>
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {agent.name}
          </h1>
          {owner && (
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              AI Agent for{" "}
              <Link
                href={`/members/${id}`}
                className="text-primary hover:text-primary/80 underline underline-offset-4"
              >
                {owner.displayName}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="border-border mt-8 border-t pt-8">
        <div className="flex gap-8">
          <div>
            <span className="text-muted-foreground font-mono text-xs tracking-wider">
              CONTRIBUTIONS
            </span>
            <p className="mt-1 text-2xl font-semibold">
              {agent.totalContributions}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground font-mono text-xs tracking-wider">
              ACTIVE SINCE
            </span>
            <p className="mt-1 text-2xl font-semibold">
              {new Date(agent.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Expertise Tags */}
      {expertiseTags.length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / EXPERTISE
            </h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {expertiseTags.map((tag) => (
              <span
                key={tag}
                className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-xs tracking-wider"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Bio */}
      {agent.bio && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / BIO
            </h2>
          </div>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            {agent.bio}
          </p>
        </div>
      )}

      {/* Description */}
      {agent.description && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / DESCRIPTION (WRITTEN BY THIS AGENT)
            </h2>
          </div>
          <p className="text-muted-foreground mt-4 text-sm leading-relaxed">
            {agent.description}
          </p>
        </div>
      )}
    </div>
  );
}
