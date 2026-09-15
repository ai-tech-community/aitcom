"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  STARTUP_CATEGORY_IDS,
  STARTUP_CATEGORY_LABELS,
  STARTUP_EXIT_STATUS_IDS,
  STARTUP_EXIT_STATUS_LABELS,
  STARTUPS_CATEGORY_ERROR,
  STARTUPS_DUPLICATE_ERROR,
  STARTUPS_EXIT_ERROR,
  STARTUPS_HOMEPAGE_ERROR,
  STARTUPS_JOBS_URL_ERROR,
  STARTUPS_SOURCES_ERROR,
  type StartupCategoryId,
  type StartupExitStatus,
  type StartupLocale,
  type StartupPublicCard,
} from "@/lib/investigations/startups";
import { api } from "@/trpc/react";

export function StartupsSubmitDialog({
  open,
  onOpenChange,
  locale,
  editing,
  copy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: StartupLocale;
  editing: StartupPublicCard | null;
  copy: {
    title: string;
    editTitle: string;
    help: string;
    fieldName: string;
    fieldHomepage: string;
    fieldCategory: string;
    fieldSources: string;
    fieldSourcesHint: string;
    fieldRegion: string;
    fieldLat: string;
    fieldLng: string;
    fieldStage: string;
    fieldLogo: string;
    fieldFounders: string;
    fieldFoundersHint: string;
    fieldExit: string;
    fieldExitNone: string;
    fieldAcquirer: string;
    fieldExitOn: string;
    fieldJobs: string;
    submit: string;
    save: string;
    cancel: string;
    success: string;
    updateSuccess: string;
  };
}) {
  const [name, setName] = useState("");
  const [homepage, setHomepage] = useState("");
  const [category, setCategory] = useState<StartupCategoryId | "">("");
  const [sourcesText, setSourcesText] = useState("");
  const [region, setRegion] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [stage, setStage] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [foundersText, setFoundersText] = useState("");
  const [exitStatus, setExitStatus] = useState<StartupExitStatus | "">("");
  const [acquirer, setAcquirer] = useState("");
  const [exitOn, setExitOn] = useState("");
  const [jobsUrl, setJobsUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const router = useRouter();
  const utils = api.useUtils();

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setHomepage(editing.homepage);
      setCategory(editing.category);
      setSourcesText(editing.sources.join("\n"));
      setRegion(editing.region ?? "");
      setLat(editing.lat != null ? String(editing.lat) : "");
      setLng(editing.lng != null ? String(editing.lng) : "");
      setStage(editing.stage ?? "");
      setLogoUrl(editing.logoUrl ?? "");
      setFoundersText(
        editing.founders
          .map((founder) =>
            founder.url ? `${founder.name} | ${founder.url}` : founder.name,
          )
          .join("\n"),
      );
      setExitStatus(editing.exitStatus ?? "");
      setAcquirer(editing.acquirer ?? "");
      setExitOn(editing.exitOn ?? "");
      setJobsUrl(editing.jobsUrl ?? "");
    } else {
      reset();
    }
  }, [open, editing]);

  const create = api.startups.createStartup.useMutation({
    onSuccess: async () => {
      toast.success(copy.success);
      await utils.startups.listApproved.invalidate();
      router.refresh();
      reset();
      onOpenChange(false);
    },
    onError: handleError,
  });

  const update = api.startups.updateStartup.useMutation({
    onSuccess: async () => {
      toast.success(copy.updateSuccess);
      await utils.startups.listApproved.invalidate();
      router.refresh();
      reset();
      onOpenChange(false);
    },
    onError: handleError,
  });

  function handleError(error: { message: string }) {
    if (
      error.message === STARTUPS_HOMEPAGE_ERROR ||
      error.message === STARTUPS_DUPLICATE_ERROR ||
      error.message === STARTUPS_SOURCES_ERROR ||
      error.message === STARTUPS_CATEGORY_ERROR ||
      error.message === STARTUPS_EXIT_ERROR ||
      error.message === STARTUPS_JOBS_URL_ERROR
    ) {
      setFormError(error.message);
      return;
    }
    toast.error(error.message);
  }

  function reset() {
    setName("");
    setHomepage("");
    setCategory("");
    setSourcesText("");
    setRegion("");
    setLat("");
    setLng("");
    setStage("");
    setLogoUrl("");
    setFoundersText("");
    setExitStatus("");
    setAcquirer("");
    setExitOn("");
    setJobsUrl("");
    setFormError(null);
  }

  function parsedOptionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!category) return;
    const payload = {
      name,
      homepage,
      category,
      sources: sourcesText
        .split(/\n|,/)
        .map((line) => line.trim())
        .filter(Boolean),
      region: region.trim() || null,
      lat: parsedOptionalNumber(lat),
      lng: parsedOptionalNumber(lng),
      stage: stage.trim() || null,
      logoUrl: logoUrl.trim() || null,
      founders: foundersText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, url] = line.split("|").map((part) => part.trim());
          return { name: name ?? "", url: url || null };
        }),
      exitStatus: exitStatus || null,
      acquirer: acquirer.trim() || null,
      exitOn: exitOn.trim() || null,
      jobsUrl: jobsUrl.trim() || null,
    };
    if (editing) {
      update.mutate({ id: editing.id, ...payload });
      return;
    }
    create.mutate(payload);
  }

  const pending = create.isPending || update.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? copy.editTitle : copy.title}</DialogTitle>
          <DialogDescription>{copy.help}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-name">{copy.fieldName}</Label>
            <Input
              id="startup-name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-homepage">{copy.fieldHomepage}</Label>
            <Input
              id="startup-homepage"
              type="url"
              required
              value={homepage}
              aria-invalid={Boolean(formError)}
              onChange={(event) => {
                setHomepage(event.target.value);
                setFormError(null);
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-category">{copy.fieldCategory}</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as StartupCategoryId)}
            >
              <SelectTrigger id="startup-category" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {STARTUP_CATEGORY_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {STARTUP_CATEGORY_LABELS[id][locale]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-sources">{copy.fieldSources}</Label>
            <Textarea
              id="startup-sources"
              required
              value={sourcesText}
              onChange={(event) => setSourcesText(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {copy.fieldSourcesHint}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="startup-region">{copy.fieldRegion}</Label>
              <Input
                id="startup-region"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="startup-lat">{copy.fieldLat}</Label>
              <Input
                id="startup-lat"
                inputMode="decimal"
                value={lat}
                onChange={(event) => setLat(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="startup-lng">{copy.fieldLng}</Label>
              <Input
                id="startup-lng"
                inputMode="decimal"
                value={lng}
                onChange={(event) => setLng(event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-stage">{copy.fieldStage}</Label>
            <Input
              id="startup-stage"
              value={stage}
              onChange={(event) => setStage(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-logo">{copy.fieldLogo}</Label>
            <Input
              id="startup-logo"
              type="url"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-founders">{copy.fieldFounders}</Label>
            <Textarea
              id="startup-founders"
              value={foundersText}
              onChange={(event) => setFoundersText(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {copy.fieldFoundersHint}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-exit">{copy.fieldExit}</Label>
            <Select
              value={exitStatus || "none"}
              onValueChange={(value) =>
                setExitStatus(
                  value === "none" ? "" : (value as StartupExitStatus),
                )
              }
            >
              <SelectTrigger id="startup-exit" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="none">{copy.fieldExitNone}</SelectItem>
                  {STARTUP_EXIT_STATUS_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {STARTUP_EXIT_STATUS_LABELS[id][locale]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {exitStatus ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="startup-acquirer">{copy.fieldAcquirer}</Label>
                <Input
                  id="startup-acquirer"
                  value={acquirer}
                  onChange={(event) => setAcquirer(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="startup-exit-on">{copy.fieldExitOn}</Label>
                <Input
                  id="startup-exit-on"
                  type="date"
                  value={exitOn}
                  onChange={(event) => setExitOn(event.target.value)}
                />
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="startup-jobs">{copy.fieldJobs}</Label>
            <Input
              id="startup-jobs"
              type="url"
              value={jobsUrl}
              onChange={(event) => setJobsUrl(event.target.value)}
            />
          </div>
          {formError ? (
            <p className="text-destructive text-sm">{formError}</p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {copy.cancel}
            </Button>
            <Button type="submit" disabled={pending || !category}>
              {editing ? copy.save : copy.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
