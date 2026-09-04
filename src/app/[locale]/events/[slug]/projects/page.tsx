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
import { getHubViewerContext } from "@/server/hackathon/hub-viewer";
import { hubTabStates } from "@/server/hackathon/hub-tabs";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { LockedTabPanel } from "@/components/hackathon/hub/locked-tab-panel";
import { SectionLabel } from "@/components/ui/section-label";
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
    alternates: await localeAlternates(`/events/${slug}/projects`),
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
  const { challengeId, phase } = resolved;

  // Cancelled events collapse to "draft" inside the phase derivation; a draft
  // hackathon has no public gallery (the tab shell never links it for a
  // non-public event, but guard the direct hit anyway).
  if (phase === "draft") notFound();

  // Phase gate via the shared hub tab state: in "live" the gallery is not yet
  // ready (rosters haven't locked) → render the locked panel in-place. The
  // LockedTabPanel replaces the page's own pre-lock empty-state to avoid
  // double "pre-lock" messaging. "locked"/"finalized" render the gallery.
  const viewer = await getHubViewerContext(challengeId, phase);
  const projectsState = hubTabStates(viewer).find((t) => t.key === "projects")!;

  // Auth presence only (no role gate): the vote button renders for any
  // signed-in member; unauthenticated viewers just see the counts (#169).
  const session = await getSession();

  let projects: GalleryProject[] = [];
  if (projectsState.available) {
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
    <section>
      <SectionLabel className="pb-4">{t("gallery")}</SectionLabel>
      <p className="text-muted-foreground mt-4 text-sm">{t("galleryIntro")}</p>

      {!projectsState.available ? (
        <div className="mt-6">
          <LockedTabPanel message={t(projectsState.lockedReasonKey!)} />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState message={t("galleryNoProjects")} />
      ) : (
        <div className="mt-6">
          <ProjectGallery
            projects={projects}
            finalized={phase === "finalized"}
            challengeId={challengeId}
            viewerAuthenticated={session?.user !== undefined}
          />
        </div>
      )}
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border-border mt-8 rounded-lg border border-dashed p-10 text-center">
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
