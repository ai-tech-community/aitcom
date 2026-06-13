"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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

/**
 * Setup tab: event details (name/description/date/times/location/cover) + team
 * size + rewards. Saves its own slice via updateHackathon. Editable only in
 * draft — once published the config is frozen, so fields go read-only and Save
 * is replaced with a frozen notice.
 */
export function ManageSetup({
  challengeId,
  eventId,
  phase,
  initialName,
  initialDescription,
  initialDate,
  initialStartTime,
  initialEndTime,
  initialLocation,
  initialCoverImageId,
  initialCoverImageUrl,
  initialTeamMin,
  initialTeamMax,
  initialXpReward,
  initialSponsorReward,
  initialBadgeReward,
}: {
  challengeId: number;
  eventId: number;
  phase: "draft" | "live" | "locked" | "finalized";
  initialName: string;
  initialDescription: string;
  initialDate: string;
  initialStartTime: string;
  initialEndTime: string;
  initialLocation: string;
  initialCoverImageId: number | null;
  initialCoverImageUrl: string;
  initialTeamMin: number;
  initialTeamMax: number;
  initialXpReward: number;
  initialSponsorReward: string;
  initialBadgeReward: string;
}) {
  const t = useTranslations("hackathon");
  const isDraft = phase === "draft";

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [location, setLocation] = useState(initialLocation);
  const [coverImageId, setCoverImageId] = useState<number | null>(
    initialCoverImageId,
  );
  const [coverImageUrl, setCoverImageUrl] = useState(initialCoverImageUrl);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [teamMin, setTeamMin] = useState(initialTeamMin);
  const [teamMax, setTeamMax] = useState(initialTeamMax);
  const [xpReward, setXpReward] = useState(initialXpReward);
  const [sponsorReward, setSponsorReward] = useState(initialSponsorReward);
  const [badgeReward, setBadgeReward] = useState(initialBadgeReward);

  const save = api.hackathon.updateHackathon.useMutation({
    onSuccess: () => toast.success(t("saveChanges")),
    onError: (e) => toast.error(e.message),
  });

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
    <div className="space-y-6">
      {!isDraft ? (
        <Card className="border-dashed p-4">
          <p className="text-muted-foreground text-xs">{t("manageFrozen")}</p>
        </Card>
      ) : null}

      {/* Details */}
      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-medium">{t("details")}</h2>
        <LabeledInput label={t("name")}>
          <Input
            value={name}
            disabled={!isDraft}
            onChange={(e) => setName(e.target.value)}
          />
        </LabeledInput>
        <LabeledInput label={t("description")}>
          <Textarea
            value={description}
            disabled={!isDraft}
            onChange={(e) => setDescription(e.target.value)}
          />
        </LabeledInput>
        <div className="grid gap-3 sm:grid-cols-3">
          <LabeledInput label={t("date")}>
            <Input
              type="date"
              value={date}
              disabled={!isDraft}
              onChange={(e) => setDate(e.target.value)}
            />
          </LabeledInput>
          <LabeledInput label={t("startTime")}>
            <Input
              type="time"
              value={startTime}
              disabled={!isDraft}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </LabeledInput>
          <LabeledInput label={t("endTime")}>
            <Input
              type="time"
              value={endTime}
              disabled={!isDraft}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </LabeledInput>
        </div>
        <LabeledInput label={t("location")}>
          <Input
            value={location}
            disabled={!isDraft}
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
          {isDraft ? (
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
          ) : null}
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
              disabled={!isDraft}
              onChange={(e) => setTeamMin(Number(e.target.value) || 1)}
            />
          </LabeledInput>
          <LabeledInput label={t("teamMax")}>
            <Input
              type="number"
              min={1}
              value={teamMax}
              disabled={!isDraft}
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
              disabled={!isDraft}
              onChange={(e) => setXpReward(Number(e.target.value) || 0)}
            />
          </LabeledInput>
          <LabeledInput label={t("sponsorReward")}>
            <Input
              value={sponsorReward}
              disabled={!isDraft}
              onChange={(e) => setSponsorReward(e.target.value)}
            />
          </LabeledInput>
          <LabeledInput label={t("badgeReward")}>
            <Input
              value={badgeReward}
              disabled={!isDraft}
              onChange={(e) => setBadgeReward(e.target.value)}
            />
          </LabeledInput>
        </div>
        <p className="text-muted-foreground text-xs">{t("prizeHint")}</p>
      </Card>

      {isDraft ? (
        <Button className="w-full" disabled={saveDisabled} onClick={onSave}>
          {t("saveChanges")}
        </Button>
      ) : null}
    </div>
  );
}
