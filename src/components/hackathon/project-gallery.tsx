"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MemberFaces } from "@/components/hackathon/member-faces";
import type { MemberFace } from "@/components/hackathon/member-faces";
import {
  gallerySortKeys,
  safeArtifactHref,
  sortGallery,
  type GallerySortKey,
} from "@/server/hackathon/gallery";

export interface GalleryProject {
  teamId: string;
  name: string;
  /** ISO string: serialized at the server/client boundary. */
  submittedAt: string;
  finalRank: number | null;
  artifactUrl: string | null;
  artifactSummary: string | null;
  memberFaces: MemberFace[];
  memberCount: number;
}

/**
 * Client half of the public project gallery (#167): holds the sort state and
 * re-orders the server-fetched entries locally. The rank sort only appears
 * once the hackathon is finalized (final ranks exist).
 */
export function ProjectGallery({
  projects,
  finalized,
}: {
  projects: GalleryProject[];
  finalized: boolean;
}) {
  const t = useTranslations("hackathon");
  const format = useFormatter();
  const [sortKey, setSortKey] = useState<GallerySortKey>("newest");

  const sortLabel: Record<GallerySortKey, string> = {
    newest: t("gallerySortNewest"),
    name: t("gallerySortName"),
    rank: t("gallerySortRank"),
  };
  const sorted = sortGallery(projects, sortKey);

  return (
    <div className="mt-8">
      <div
        role="group"
        aria-label={t("gallerySortBy")}
        className="flex flex-wrap items-center gap-2"
      >
        <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
          {t("gallerySortBy")}
        </span>
        {gallerySortKeys(finalized).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={sortKey === key ? "secondary" : "ghost"}
            aria-pressed={sortKey === key}
            onClick={() => setSortKey(key)}
          >
            {sortLabel[key]}
          </Button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {sorted.map((project) => {
          // Captain-controlled URL: only http(s) may render as a public href.
          const artifactHref = safeArtifactHref(project.artifactUrl);
          return (
            <div
              key={project.teamId}
              className="border-border bg-card rounded-lg border p-5"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{project.name}</h2>
                {project.finalRank !== null ? (
                  <span className="text-muted-foreground font-mono text-xs tracking-wider">
                    {t("rank")} #{project.finalRank}
                  </span>
                ) : (
                  <Badge variant="secondary">{t("submitted")}</Badge>
                )}
              </div>
              <div className="text-muted-foreground mt-1 font-mono text-[11px] tracking-wider">
                {format.dateTime(new Date(project.submittedAt), {
                  dateStyle: "medium",
                })}
              </div>

              {project.artifactSummary ? (
                <p className="mt-3 text-sm whitespace-pre-line">
                  {project.artifactSummary}
                </p>
              ) : null}

              {artifactHref ? (
                <a
                  href={artifactHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground/80 hover:text-foreground mt-3 inline-block font-mono text-xs tracking-wider underline underline-offset-4 transition-colors"
                >
                  {t("galleryViewProject")} ↗
                </a>
              ) : null}

              <MemberFaces
                faces={project.memberFaces}
                privateCount={project.memberCount - project.memberFaces.length}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
