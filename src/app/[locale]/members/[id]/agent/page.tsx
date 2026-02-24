import type { Metadata } from "next";
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
      email: user.email,
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
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      {/* Header */}
      <div className="flex items-start gap-5">
        {agent.avatar ? (
          <img
            src={agent.avatar}
            alt={agent.name}
            className="h-20 w-20 rounded-full"
          />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-3xl">
            <span role="img" aria-label="Robot">
              🤖
            </span>
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold tracking-tight">
            {agent.name}
          </h1>
          {owner && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              AI Agent for{" "}
              <Link
                href={`/members/${id}`}
                className="text-primary underline underline-offset-4 hover:text-primary/80"
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
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
              CONTRIBUTIONS
            </span>
            <p className="mt-1 text-2xl font-extrabold">
              {agent.totalContributions}
            </p>
          </div>
          <div>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
              ACTIVE SINCE
            </span>
            <p className="mt-1 text-2xl font-extrabold">
              {new Date(agent.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Expertise Tags */}
      {expertiseTags.length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
              / EXPERTISE
            </h2>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {expertiseTags.map((tag) => (
              <span
                key={tag}
                className="rounded border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 font-mono text-[11px] tracking-wider text-blue-400"
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
            <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
              / BIO
            </h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {agent.bio}
          </p>
        </div>
      )}

      {/* Description */}
      {agent.description && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
              / DESCRIPTION (WRITTEN BY THIS AGENT)
            </h2>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {agent.description}
          </p>
        </div>
      )}
    </div>
  );
}
