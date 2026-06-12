"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CellTemplateEditor,
  type CellRow,
} from "@/components/hackathon/cell-template-editor";
import { HackathonAnalytics } from "@/components/hackathon/hackathon-analytics";

function LabeledInput({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export function HackathonManage({
  communitySlug,
  eventId,
  eventSlug,
  initialPhase,
  challengeId,
  initialName,
  initialDescription,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialLocation,
  initialCoverImageId,
  initialCoverImageUrl,
  initialCells,
  teamMin: initialTeamMin,
  teamMax: initialTeamMax,
  initialXpReward,
  initialSponsorReward,
  initialBadgeReward,
}: {
  communitySlug: string;
  eventId: number;
  eventSlug: string;
  initialPhase: "draft" | "live" | "locked" | "finalized";
  challengeId: number;
  initialName: string;
  initialDescription: string;
  initialDate: string;
  initialStartTime: string;
  initialEndTime: string;
  initialLocation: string;
  initialCoverImageId: number | null;
  initialCoverImageUrl: string;
  initialCells: CellRow[];
  teamMin: number;
  teamMax: number;
  initialXpReward: number;
  initialSponsorReward: string;
  initialBadgeReward: string;
}) {
  const t = useTranslations("hackathon");

  // Details
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [location, setLocation] = useState(initialLocation);
  // Cover image
  const [coverImageId, setCoverImageId] = useState<number | null>(
    initialCoverImageId,
  );
  const [coverImageUrl, setCoverImageUrl] = useState(initialCoverImageUrl);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  // Teams + prize
  const [teamMin, setTeamMin] = useState(initialTeamMin);
  const [teamMax, setTeamMax] = useState(initialTeamMax);
  const [xpReward, setXpReward] = useState(initialXpReward);
  const [sponsorReward, setSponsorReward] = useState(initialSponsorReward);
  const [badgeReward, setBadgeReward] = useState(initialBadgeReward);
  // Tasks
  const [cells, setCells] = useState<CellRow[]>(initialCells);

  // Seeded from server truth (team lock/finalize markers) so a reload after
  // finalizing doesn't re-enable Lock Rosters / Finalize.
  const [phase, setPhase] = useState<"draft" | "live" | "locked" | "finalized">(
    initialPhase,
  );
  const isDraft = phase === "draft";

  const utils = api.useUtils();
  const save = api.hackathon.updateHackathon.useMutation({
    onSuccess: () => toast.success(t("saveChanges")),
    onError: (e) => toast.error(e.message),
  });
  const publish = api.hackathon.publishHackathon.useMutation({
    onSuccess: () => {
      setPhase("live");
      toast.success(t("statusLive"));
    },
    onError: (e) => toast.error(e.message),
  });
  const lock = api.hackathon.lockRosters.useMutation({
    onSuccess: () => {
      setPhase("locked");
      toast.success(t("statusLocked"));
    },
    onError: (e) => toast.error(e.message),
  });
  const finalize = api.hackathon.finalizeHackathon.useMutation({
    onSuccess: () => {
      setPhase("finalized");
      void utils.hackathon.teamLeaderboard.invalidate({ challengeId });
      toast.success(t("statusFinalized"));
    },
    onError: (e) => toast.error(e.message),
  });

  const statusLabel =
    phase === "draft"
      ? t("statusDraft")
      : phase === "locked"
        ? t("statusLocked")
        : phase === "finalized"
          ? t("statusFinalized")
          : t("statusLive");

  const onCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("alt", name || "Hackathon cover");
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = (await res.json()) as { url: string; id: number };
      setCoverImageId(data.id);
      setCoverImageUrl(data.url);
    } catch {
      toast.error(t("uploading"));
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const onSave = () =>
    save.mutate({
      challengeId,
      eventId,
      name: name.trim(),
      description,
      date,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      location: location.trim(),
      coverImage: coverImageId,
      // The server rejects any post-draft update carrying cellTemplate
      // (tasks are frozen at publish), so omit it once out of draft.
      ...(isDraft ? { cellTemplate: cells } : {}),
      teamMin,
      teamMax,
      xpReward,
      sponsorReward,
      badgeReward,
    });

  const saveDisabled =
    save.isPending ||
    name.trim().length < 3 ||
    !date ||
    !location.trim() ||
    teamMin > teamMax;

  return (
    <section className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/communities/${communitySlug}/events`}
            className="text-muted-foreground text-sm hover:underline"
          >
            ← {communitySlug}
          </Link>
          <h1 className="truncate text-xl font-semibold">
            {name || t("createTitle")}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!isDraft ? (
            <Link
              href={`/events/${eventSlug}`}
              className="text-sm hover:underline"
              target="_blank"
            >
              {t("viewPublicPage")}
            </Link>
          ) : null}
          <Badge variant={isDraft ? "outline" : "secondary"}>
            {statusLabel}
          </Badge>
        </div>
      </div>

      {/* Details */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">{t("details")}</h2>
        <LabeledInput label={t("name")}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </LabeledInput>
        <LabeledInput label={t("description")}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </LabeledInput>
        <div className="grid gap-3 sm:grid-cols-3">
          <LabeledInput label={t("date")}>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </LabeledInput>
          <LabeledInput label={t("startTime")}>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </LabeledInput>
          <LabeledInput label={t("endTime")}>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </LabeledInput>
        </div>
        <LabeledInput label={t("location")}>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </LabeledInput>
        <div className="space-y-2">
          <span className="text-muted-foreground text-xs font-medium">
            {t("coverImage")}
          </span>
          {coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImageUrl}
              alt={name}
              className="border-border h-32 w-full rounded-md border object-cover"
            />
          ) : null}
          <div className="flex items-center gap-2">
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onCoverUpload}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={coverUploading}
              onClick={() => coverInputRef.current?.click()}
            >
              {coverUploading ? t("uploading") : t("uploadImage")}
            </Button>
            {coverImageId !== null ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCoverImageId(null);
                  setCoverImageUrl("");
                }}
              >
                {t("removeImage")}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Teams + prize */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">
          {t("teams")} · {t("prize")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <LabeledInput label={t("teamMin")}>
            <Input
              type="number"
              min={1}
              value={teamMin}
              onChange={(e) => setTeamMin(Number(e.target.value) || 1)}
            />
          </LabeledInput>
          <LabeledInput label={t("teamMax")}>
            <Input
              type="number"
              min={1}
              value={teamMax}
              onChange={(e) => setTeamMax(Number(e.target.value) || 1)}
            />
          </LabeledInput>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <LabeledInput label={t("xpReward")}>
            <Input
              type="number"
              min={0}
              value={xpReward}
              onChange={(e) => setXpReward(Number(e.target.value) || 0)}
            />
          </LabeledInput>
          <LabeledInput label={t("sponsorReward")}>
            <Input
              value={sponsorReward}
              onChange={(e) => setSponsorReward(e.target.value)}
            />
          </LabeledInput>
          <LabeledInput label={t("badgeReward")}>
            <Input
              value={badgeReward}
              onChange={(e) => setBadgeReward(e.target.value)}
            />
          </LabeledInput>
        </div>
        <p className="text-muted-foreground text-xs">{t("prizeHint")}</p>
      </Card>

      {/* Tasks */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">{t("tasks")}</h2>
        <p className="text-muted-foreground text-xs">
          {isDraft ? t("tasksHint") : t("tasksFrozen")}
        </p>
        <CellTemplateEditor
          cells={cells}
          onChange={setCells}
          disabled={!isDraft}
        />
      </Card>

      <Button className="w-full" disabled={saveDisabled} onClick={onSave}>
        {t("saveChanges")}
      </Button>

      {/* Analytics (#165) — participation funnel + cell completion */}
      <HackathonAnalytics challengeId={challengeId} phase={phase} />

      {/* Lifecycle */}
      <Card className="space-y-4 p-4">
        <h2 className="text-sm font-medium">{t("lifecycle")}</h2>

        <div className="space-y-1">
          <Button
            className="w-full"
            disabled={publish.isPending || !isDraft || cells.length === 0}
            onClick={() => publish.mutate({ challengeId, eventId })}
          >
            {t("publish")}
          </Button>
          <p className="text-muted-foreground text-xs">{t("publishDesc")}</p>
        </div>

        <div className="space-y-1">
          <Button
            className="w-full"
            variant="secondary"
            disabled={lock.isPending || isDraft || phase === "finalized"}
            onClick={() => lock.mutate({ challengeId })}
          >
            {t("lockRosters")}
          </Button>
          <p className="text-muted-foreground text-xs">
            {isDraft ? t("publishFirst") : t("lockRostersDesc")}
          </p>
        </div>

        <div className="space-y-1">
          <Button
            className="w-full"
            variant="destructive"
            disabled={finalize.isPending || isDraft || phase === "finalized"}
            onClick={() => {
              if (window.confirm(t("finalizeConfirm"))) {
                finalize.mutate({ challengeId });
              }
            }}
          >
            {t("finalize")}
          </Button>
          <p className="text-muted-foreground text-xs">
            {isDraft ? t("publishFirst") : t("finalizeDesc")}
          </p>
        </div>
      </Card>
    </section>
  );
}
