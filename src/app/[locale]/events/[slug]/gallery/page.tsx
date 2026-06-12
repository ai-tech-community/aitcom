import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { teams } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { api } from "@/trpc/server";
import { hackathonPhase } from "@/server/hackathon/phase";
import { submittedProjects } from "@/server/hackathon/gallery";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { Link } from "@/i18n/navigation";
import {
  ProjectGallery,
  type GalleryProject,
} from "@/components/hackathon/project-gallery";

// Same public-visibility filter as the event details page: hide un-approved
// submissions (pending/rejected) and drafts.
async function findPublicEvent(slug: string, locale: "en" | "nl") {
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { slug: { equals: slug } },
        { status: { not_in: ["draft", "rejected"] } },
      ],
    },
    locale,
    limit: 1,
    depth: 0,
  });
  return docs[0] ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const [event, t] = await Promise.all([
    findPublicEvent(slug, locale as "en" | "nl"),
    getTranslations("hackathon"),
  ]);
  if (!event?.challengeId) return {};

  const title = `${event.title} — ${t("gallery")}`;
  const description = t("galleryIntro");
  return {
    title,
    description,
    ...buildOgMeta(title, description),
    alternates: buildAlternates(`/events/${slug}/gallery`),
  };
}

export default async function HackathonGalleryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = await getTranslations("hackathon");

  const event = await findPublicEvent(slug, locale as "en" | "nl");
  // Not a hackathon (no bound challenge) → there is no project gallery.
  if (!event?.challengeId) notFound();

  const payload = await getPayloadClient();
  let challenge;
  try {
    challenge = await payload.findByID({
      collection: "challenges",
      id: Number(event.challengeId),
      depth: 0,
    });
  } catch {
    notFound();
  }
  const challengeId = Number(challenge.id);

  // Phase gate from server truth (same derivation as the winners page).
  // Cancelled events collapse to "draft" and bounce back to the event page;
  // "live" renders an explainer (submissions only start once rosters lock).
  const phaseMarkers = await db
    .select({
      status: teams.status,
      finalRank: teams.finalRank,
      prizeAwardedAt: teams.prizeAwardedAt,
    })
    .from(teams)
    .where(eq(teams.challengeId, challengeId));
  const phase = hackathonPhase({
    eventStatus: event.status,
    challengeStatus: challenge.status ?? "",
    teams: phaseMarkers,
  });
  if (phase === "draft") redirect(`/events/${slug}`);

  let projects: GalleryProject[] = [];
  if (phase !== "live") {
    const leaderboard = await api.hackathon.teamLeaderboard({ challengeId });
    projects = submittedProjects(leaderboard).map((team) => ({
      teamId: team.teamId,
      name: team.name,
      // ISO string: Date doesn't cross the server→client component boundary.
      submittedAt: team.submittedAt.toISOString(),
      finalRank: team.finalRank,
      artifactUrl: team.artifactUrl,
      artifactSummary: team.artifactSummary,
      memberFaces: team.memberFaces,
      memberCount: team.memberCount,
    }));
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 sm:py-16">
      <nav className="mb-6 flex items-center gap-2 font-mono text-[11px] tracking-wider">
        <Link
          href="/events"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          / EVENTS
        </Link>
        <span className="text-muted-foreground">/</span>
        <Link
          href={`/events/${slug}`}
          className="text-muted-foreground hover:text-foreground truncate transition-colors"
        >
          {event.title}
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground/80">{t("gallery")}</span>
      </nav>

      <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
        {t("gallery")}
      </h1>
      <p className="text-muted-foreground mt-2">{t("galleryIntro")}</p>

      {phase === "live" ? (
        <EmptyState message={t("galleryPreLock")} />
      ) : projects.length === 0 ? (
        <EmptyState message={t("galleryNoProjects")} />
      ) : (
        <ProjectGallery projects={projects} finalized={phase === "finalized"} />
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border-border mt-8 rounded-lg border border-dashed p-10 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
