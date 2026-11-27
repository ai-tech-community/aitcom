"use client";

import { useEffect, useId } from "react";
import { useTranslations } from "next-intl";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { toast } from "sonner";

import { useCommunityThemePreview } from "@/components/communities/theme/community-theme-preview";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  COMMUNITY_THEMES,
  isCommunityThemeId,
  resolveCommunityTheme,
} from "@/lib/communities/themes";
import { api } from "@/trpc/react";

import { ThemeTile } from "./theme-tile";

/**
 * Settings → Themes. Choosing a look previews it on the real page around
 * the form (the community frame reads the preview); the sticky bar saves
 * or cancels it. The preview never outlives this page: leaving it, saving
 * or cancelling clears it.
 *
 * The tiles are a Radix radio group: one tab stop (roving tab index), arrow
 * keys move and choose, wrapping at the ends, so arrowing through the looks
 * previews each one.
 */
export function ThemeSettings({ slug }: { slug: string }) {
  const t = useTranslations("communities.settings.themes");
  const tLook = useTranslations("communities.themes");
  const titleId = useId();
  const introId = useId();
  const utils = api.useUtils();
  const community = api.communities.getBySlug.useQuery({ slug });
  const { previewId, setPreviewId } = useCommunityThemePreview();

  useEffect(() => () => setPreviewId(null), [setPreviewId]);

  const setTheme = api.communities.setTheme.useMutation({
    // Clear the preview only once the frame has the saved look, so the
    // page does not flash back to the old one in between.
    onSuccess: async () => {
      toast.success(t("saved"));
      await utils.communities.getBySlug.invalidate({ slug });
      setPreviewId(null);
    },
    onError: () => {
      toast.error(t("error"));
    },
  });

  const header = (
    <div>
      <h1 id={titleId} className="font-community-heading text-lg font-semibold">
        {t("title")}
      </h1>
      <p id={introId} className="text-muted-foreground text-sm">
        {t("intro")}
      </p>
    </div>
  );

  if (community.isError) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState
          className="border-border rounded-lg border"
          onRetry={() => void community.refetch()}
        />
      </div>
    );
  }

  if (!community.data) {
    return (
      <div className="@container space-y-6">
        {header}
        <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @3xl:grid-cols-3">
          {COMMUNITY_THEMES.map((theme) => (
            <Skeleton key={theme.id} className="h-52 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { name, bannerUrl, themeId } = community.data;
  const savedId = resolveCommunityTheme(themeId).id;
  const chosenId = previewId ?? savedId;
  const isPreviewing = chosenId !== savedId;

  return (
    <div className="@container space-y-6">
      {header}

      <RadioGroupPrimitive.Root
        value={chosenId}
        onValueChange={(value) => {
          if (!isCommunityThemeId(value)) return;
          setPreviewId(value === savedId ? null : value);
        }}
        aria-labelledby={titleId}
        aria-describedby={introId}
        className="grid grid-cols-1 gap-4 @md:grid-cols-2 @3xl:grid-cols-3"
      >
        {COMMUNITY_THEMES.map((theme) => (
          <ThemeTile
            key={theme.id}
            theme={theme}
            communityName={name}
            bannerUrl={bannerUrl ?? null}
            isCurrent={theme.id === savedId}
          />
        ))}
      </RadioGroupPrimitive.Root>

      {isPreviewing ? (
        <div className="bg-card border-border sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-md">
          <p className="text-sm font-medium">
            {t("previewing", { name: tLook(`${chosenId}.name`) })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={setTheme.isPending}
              onClick={() => setPreviewId(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              disabled={setTheme.isPending}
              onClick={() => setTheme.mutate({ slug, themeId: chosenId })}
            >
              {t("save")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
