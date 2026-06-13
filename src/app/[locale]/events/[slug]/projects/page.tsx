import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { api } from "@/trpc/server";
import { getSession } from "@/server/better-auth/server";
import {
  findPublicEvent,
  resolvePublicHackathonPage,
} from "@/server/hackathon/resolve-public-hackathon";
import { submittedProjects } from "@/server/hackathon/gallery";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { Link, redirect } from "@/i18n/navigation";
import {
  ProjectGallery,
  type GalleryProject,
} from "@/components/hackathon/project-gallery";

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
    alternates: buildAlternates(`/events/${slug}/projects`),
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

  // Not a hackathon (no public event / no bound challenge) → no gallery.
  const resolved = await resolvePublicHackathonPage(
    slug,
    locale as "en" | "nl",
  );
  if (!resolved.found) notFound();
  const { event, challengeId, phase } = resolved;

  // Phase gate from server truth (same derivation as the winners page).
  // Cancelled events collapse to "draft" and bounce back to the event page;
  // "live" renders an explainer (submissions only start once rosters lock).
  if (phase === "draft") redirect({ href: `/events/${slug}`, locale });

  // Auth presence only (no role gate): the vote button renders for any
  // signed-in member; unauthenticated viewers just see the counts (#169).
  const session = await getSession();

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
        <ProjectGallery
          projects={projects}
          finalized={phase === "finalized"}
          challengeId={challengeId}
          viewerAuthenticated={session?.user !== undefined}
        />
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
