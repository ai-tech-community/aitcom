"use client";

import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { communityMagazinePath, magazinePath } from "@/lib/magazines/paths";
import {
  type IssueVisibility,
  MAGAZINE_SLUG_PATTERN,
  MAX_MAGAZINE_TOPICS,
} from "@/lib/magazines/values";
import { slugify } from "@/lib/text-utils";
import type { Magazine } from "@/payload-types";
import type { CommunityVisibility } from "@/server/communities/content-visibility";
import type { VisibilityRecord } from "@/lib/magazines/visibility";
import { api } from "@/trpc/react";

import { readEditorError } from "./editor-errors";
import { ImageUploadField } from "./image-upload-field";
import { PublicOptIn, publicOptInRequired } from "./public-opt-in";

const NAME_MAX = 120;
const SLUG_MIN = 3;
const SLUG_MAX = 60;
const DESCRIPTION_MAX = 500;
const TOPIC_MAX = 40;

/** The form's working copy of the magazine. */
type Draft = {
  name: string;
  magazineSlug: string;
  description: string;
  logoUrl: string | null;
  topics: string[];
  defaultVisibility: IssueVisibility;
};

function draftOf(magazine: Magazine | null): Draft {
  return {
    name: magazine?.name ?? "",
    magazineSlug: magazine?.slug ?? "",
    description: magazine?.description ?? "",
    logoUrl: magazine?.logoUrl ?? null,
    topics: (magazine?.topics ?? []).flatMap((row) =>
      row.topic ? [row.topic] : [],
    ),
    defaultVisibility: magazine?.defaultVisibility ?? "members",
  };
}

/** The saved default, which decides whether the opt-in is still needed. */
function savedDefaultOf(magazine: Magazine | null): VisibilityRecord {
  return {
    visibility: magazine?.defaultVisibility ?? "members",
    publicConfirmedBy: magazine?.publicConfirmedBy ?? null,
    publicConfirmedAt: magazine?.publicConfirmedAt ?? null,
  };
}

/** A magazine address suggested from its name, within the slug rules. */
function suggestSlug(name: string): string {
  return slugify(name).slice(0, SLUG_MAX).replace(/-+$/, "");
}

function isValidSlug(slug: string): boolean {
  return (
    slug.length >= SLUG_MIN &&
    slug.length <= SLUG_MAX &&
    MAGAZINE_SLUG_PATTERN.test(slug)
  );
}

/** Trimmed and lower-cased, as the server stores topics. */
function normalizeTopic(raw: string): string {
  return raw.trim().toLowerCase();
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-10" />
      <Skeleton className="h-10" />
      <Skeleton className="h-24" />
      <Skeleton className="h-10 w-48" />
    </div>
  );
}

/**
 * The magazine settings in the community settings (create or edit). The
 * default visibility runs through the same rule as the save
 * (`planVisibilityChange`, via `publicOptInRequired`): `public` in a private
 * community that has not confirmed it shows `PublicOptIn`, blocks Save until
 * ticked, and only then sends `confirmUnlistedPublic`. Refusals show as
 * friendly text through `editorErrorKey`.
 */
export function MagazineSettingsForm({
  slug,
  showOpenTabLink = true,
}: {
  slug: string;
  showOpenTabLink?: boolean;
}) {
  const t = useTranslations("magazineEditor.settings");
  const settings = api.magazines.getSettings.useQuery({ slug });

  if (settings.isLoading) return <SettingsSkeleton />;
  if (settings.isError || !settings.data) {
    return (
      <ErrorState
        title={t("loadFailed")}
        retryLabel={t("tryAgain")}
        onRetry={() => void settings.refetch()}
      />
    );
  }
  const { magazine, communityIsPrivate, community } = settings.data;
  // Keyed by the saved row, so a save that changes it starts a fresh copy.
  return (
    <SettingsEditor
      key={magazine?.updatedAt ?? "new"}
      slug={slug}
      magazine={magazine}
      communityIsPrivate={communityIsPrivate}
      community={community}
      showOpenTabLink={showOpenTabLink}
    />
  );
}

function SettingsEditor({
  slug,
  magazine,
  communityIsPrivate,
  community,
  showOpenTabLink,
}: {
  slug: string;
  magazine: Magazine | null;
  communityIsPrivate: boolean;
  community: CommunityVisibility;
  showOpenTabLink: boolean;
}) {
  const t = useTranslations("magazineEditor.settings");
  const tErrors = useTranslations("magazineEditor.errors");
  const utils = api.useUtils();

  const [draft, setDraft] = useState<Draft>(() => draftOf(magazine));
  // A new magazine's address follows its name until the editor types one.
  const [slugTouched, setSlugTouched] = useState(magazine !== null);
  const [confirmed, setConfirmed] = useState(false);
  const [topicInput, setTopicInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);
  /** Set when a topic chip's × was used: its button is gone after render. */
  const focusTopicInput = useRef(false);

  const nameId = useId();
  const slugId = useId();
  const slugHintId = useId();
  const slugErrorId = useId();
  const descriptionId = useId();
  const descriptionHintId = useId();
  const topicsId = useId();
  const topicsHintId = useId();

  const save = api.magazines.saveSettings.useMutation({
    onSuccess: () => {
      toast.success(magazine ? t("saved") : t("created"));
      void utils.magazines.getSettings.invalidate({ slug });
      // A first save adds the Magazine tab to the community nav.
      void utils.spaces.list.invalidate({ slug });
    },
    onError: (error) => setSaveError(tErrors(readEditorError(error).key)),
  });

  const update = (patch: Partial<Draft>) => {
    setSaveError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const optInRequired = publicOptInRequired({
    next: draft.defaultVisibility,
    saved: savedDefaultOf(magazine),
    community,
  });
  const alreadyConfirmed =
    communityIsPrivate &&
    draft.defaultVisibility === "public" &&
    !optInRequired;

  const slugValid = isValidSlug(draft.magazineSlug);
  const showSlugError = draft.magazineSlug.length > 0 && !slugValid;
  const nameValid = draft.name.trim().length > 0;
  const topicsFull = draft.topics.length >= MAX_MAGAZINE_TOPICS;

  // A removed chip takes its × with it: put focus in the topic field, where
  // a keyboard user adds the next topic (WCAG 2.4.3).
  useEffect(() => {
    if (!focusTopicInput.current) return;
    focusTopicInput.current = false;
    topicInputRef.current?.focus();
  }, [draft.topics]);
  const canSave =
    nameValid &&
    slugValid &&
    !isUploading &&
    !save.isPending &&
    (!optInRequired || confirmed);

  const handleName = (name: string) => {
    update(slugTouched ? { name } : { name, magazineSlug: suggestSlug(name) });
  };

  const addTopic = () => {
    const topic = normalizeTopic(topicInput);
    if (!topic || topicsFull) return;
    setTopicInput("");
    if (!draft.topics.includes(topic))
      update({ topics: [...draft.topics, topic] });
  };

  const handleTopicKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addTopic();
  };

  const handleVisibility = (next: IssueVisibility) => {
    update({ defaultVisibility: next });
    // Leaving `public` withdraws the tick: coming back asks again.
    if (next !== "public") setConfirmed(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaveError(null);
    const description = draft.description.trim();
    save.mutate({
      slug,
      name: draft.name.trim(),
      magazineSlug: draft.magazineSlug,
      ...(description ? { description } : {}),
      logoUrl: draft.logoUrl,
      topics: draft.topics,
      defaultVisibility: draft.defaultVisibility,
      // Sent only when the editor ticked the opt-in this save asks for.
      ...(optInRequired && confirmed ? { confirmUnlistedPublic: true } : {}),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <SectionLabel>{t("title")}</SectionLabel>
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
        {magazine && showOpenTabLink && (
          <Link
            href={communityMagazinePath(slug)}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {t("openTab")}
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>{t("nameLabel")}</Label>
        <Input
          id={nameId}
          value={draft.name}
          onChange={(e) => handleName(e.target.value)}
          maxLength={NAME_MAX}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={slugId}>{t("slugLabel")}</Label>
        <Input
          id={slugId}
          value={draft.magazineSlug}
          onChange={(e) => {
            setSlugTouched(true);
            update({ magazineSlug: e.target.value });
          }}
          maxLength={SLUG_MAX}
          spellCheck={false}
          autoCapitalize="none"
          aria-invalid={showSlugError || undefined}
          aria-describedby={
            showSlugError ? `${slugErrorId} ${slugHintId}` : slugHintId
          }
          className="font-mono"
        />
        <p className="text-muted-foreground font-mono text-xs break-all">
          {magazinePath({ slug: draft.magazineSlug || "…" })}
        </p>
        {showSlugError && (
          <p id={slugErrorId} className="text-destructive text-sm">
            {t("slugInvalid")}
          </p>
        )}
        <p id={slugHintId} className="text-muted-foreground text-sm">
          {t("slugHint")}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={descriptionId}>{t("descriptionLabel")}</Label>
        <Textarea
          id={descriptionId}
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          maxLength={DESCRIPTION_MAX}
          rows={3}
          aria-describedby={descriptionHintId}
        />
        <p id={descriptionHintId} className="text-muted-foreground text-sm">
          {t("descriptionHint")}
        </p>
      </div>

      <ImageUploadField
        value={draft.logoUrl}
        onChange={(logoUrl) => update({ logoUrl })}
        onUploadingChange={setIsUploading}
        uploadAlt="magazine logo"
        text={{
          label: t("logoLabel"),
          hint: t("logoHint"),
          upload: t("logoUpload"),
          replace: t("logoReplace"),
          remove: t("logoRemove"),
          uploading: t("logoUploading"),
          failed: t("uploadFailed"),
        }}
        renderPreview={(url) => (
          // Any host an editor links to: next/image only serves listed hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="bg-secondary size-16 rounded-lg border object-cover"
          />
        )}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor={topicsId}>{t("topicsLabel")}</Label>
        {draft.topics.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {draft.topics.map((topic) => (
              <li
                key={topic}
                className="inline-flex h-7 items-center gap-1 rounded-full border pr-1 pl-3 text-xs"
              >
                {topic}
                <button
                  type="button"
                  aria-label={t("topicRemove", { topic })}
                  onClick={() => {
                    focusTopicInput.current = true;
                    update({ topics: draft.topics.filter((x) => x !== topic) });
                  }}
                  className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex size-5 items-center justify-center rounded-full outline-none focus-visible:ring-[3px]"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            ref={topicInputRef}
            id={topicsId}
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            onKeyDown={handleTopicKey}
            maxLength={TOPIC_MAX}
            disabled={topicsFull}
            aria-describedby={topicsHintId}
          />
          <Button
            type="button"
            variant="outline"
            onClick={addTopic}
            disabled={topicsFull || !normalizeTopic(topicInput)}
          >
            {t("topicAdd")}
          </Button>
        </div>
        <p id={topicsHintId} className="text-muted-foreground text-sm">
          {topicsFull ? t("topicsFull") : t("topicsHint")}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm leading-none font-medium">
          {t("visibilityLabel")}
        </p>
        <SegmentedControl<IssueVisibility>
          aria-label={t("visibilityLabel")}
          value={draft.defaultVisibility}
          onValueChange={handleVisibility}
          className="self-start"
          options={[
            { value: "members", label: t("visibilityMembers") },
            { value: "public", label: t("visibilityPublic") },
          ]}
        />
        <p className="text-muted-foreground text-sm">{t("visibilityHint")}</p>
        {optInRequired && (
          <PublicOptIn
            communityIsPrivate={communityIsPrivate}
            value={draft.defaultVisibility}
            confirmed={confirmed}
            onConfirmedChange={(next) => {
              setSaveError(null);
              setConfirmed(next);
            }}
          />
        )}
        {alreadyConfirmed && (
          <p className="text-muted-foreground text-sm">
            {t("alreadyConfirmed")}
          </p>
        )}
      </div>

      <div className="flex flex-col items-start gap-3">
        {saveError && (
          <p role="alert" className="text-destructive text-sm">
            {saveError}
          </p>
        )}
        {/* The page's one primary action (One Voice Rule). */}
        <Button type="submit" disabled={!canSave}>
          {save.isPending ? t("saving") : magazine ? t("save") : t("create")}
        </Button>
      </div>
    </form>
  );
}
