"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Link } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { SectionLabel } from "@/components/ui/section-label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { RoleHelpRequest } from "@/lib/investigations/startup-role-help";
import {
  TRACKING_STATUSES,
  type TrackingStatus,
} from "@/lib/investigations/startup-tracking";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";
import {
  STARTUPS_JOBS_PATH,
  buildStartupProfilePath,
  buildStartupRolePath,
} from "@/lib/investigations/startups";
import { api } from "@/trpc/react";

export type TrackedBoardRole = {
  role: StartupRolePublic;
  status: TrackingStatus;
};

const COPY = {
  en: {
    kicker: "Jobs",
    title: "Your board",
    lead: "Roles you track on open positions land here. Only you can see this board.",
    empty:
      "Nothing tracked yet. Track a role on open positions and it shows up in Applying.",
    open: "Open positions",
    remove: "Remove",
    ask: "Ask for help",
    cancel: "Cancel",
    community: "Community",
    communityEmpty: "Join a community first",
    note: "What do you want help with?",
    classroom: "Classroom",
    classroomHelp:
      "Optional. Only a classroom that already exists in that community.",
    post: "Post to community",
    posting: "Posting…",
    posted: "Posted to the community",
    rules: "Accept that community's rules, then try again.",
    classroomMissing: "That classroom is not in this community.",
    sheetLead: "Posts a question in the community you pick.",
    helpTitle: "What the community sees",
    viewPost: "View post",
    helpPick: "Preview community",
    member: "A member",
    applying: "Applying",
    applied: "Applied",
    talking: "Talking",
    offer: "Offer",
    passed: "Passed",
  },
  nl: {
    kicker: "Vacatures",
    title: "Jouw bord",
    lead: "Rollen die je bijhoudt bij open posities komen hier. Alleen jij ziet dit bord.",
    empty:
      "Nog niets bijgehouden. Houd een rol bij op open posities en hij verschijnt bij Solliciteren.",
    open: "Open posities",
    remove: "Verwijderen",
    ask: "Vraag om hulp",
    cancel: "Annuleren",
    community: "Community",
    communityEmpty: "Word eerst lid van een community",
    note: "Waar wil je hulp bij?",
    classroom: "Classroom",
    classroomHelp:
      "Optioneel. Alleen een classroom die al in die community bestaat.",
    post: "Plaats in community",
    posting: "Plaatsen…",
    posted: "Geplaatst in de community",
    rules: "Accepteer eerst de regels van die community.",
    classroomMissing: "Die classroom staat niet in deze community.",
    sheetLead: "Plaatst een vraag in de community die je kiest.",
    helpTitle: "Wat de community ziet",
    viewPost: "Bekijk bericht",
    helpPick: "Bekijk community",
    member: "Een lid",
    applying: "Solliciteren",
    applied: "Gesolliciteerd",
    talking: "In gesprek",
    offer: "Aanbod",
    passed: "Afgerond",
  },
} as const;

type BoardCopy = (typeof COPY)[keyof typeof COPY];

function statusLabel(copy: BoardCopy, status: TrackingStatus): string {
  return copy[status];
}

export function StartupsJobsBoard({
  locale,
  tracked,
  communities,
  helpRequests = [],
}: {
  locale: string;
  tracked: TrackedBoardRole[];
  communities: { slug: string; name: string }[];
  helpRequests?: RoleHelpRequest[];
}) {
  const copy = locale === "nl" ? COPY.nl : COPY.en;
  const helpLocale = locale === "nl" ? "nl" : "en";
  const [rows, setRows] = useState(tracked);
  const [askingId, setAskingId] = useState<string | null>(null);
  const [communitySlug, setCommunitySlug] = useState(
    communities[0]?.slug ?? "",
  );
  const [note, setNote] = useState("");
  const [classroom, setClassroom] = useState("");
  const [help, setHelp] = useState<RoleHelpRequest[]>(helpRequests);
  const [previewSlug, setPreviewSlug] = useState(communities[0]?.slug ?? "");
  const utils = api.useUtils();
  const setStatus = api.startups.setMyTrackedRoleStatus.useMutation({
    onError: (error) => toast.error(error.message),
  });
  const removeTrack = api.startups.setMyRoleApplication.useMutation({
    onSuccess: async (_data, variables) => {
      await utils.startups.getMyRoleApplication.invalidate({
        roleId: variables.roleId,
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const askHelp = api.startups.askMyTrackedRoleHelp.useMutation({
    onSuccess: (result) => {
      setHelp((current) => [
        result,
        ...current.filter(
          (row) =>
            !(
              row.roleId === result.roleId &&
              row.communitySlug === result.communitySlug
            ),
        ),
      ]);
      setPreviewSlug(result.communitySlug);
      setAskingId(null);
      setNote("");
      setClassroom("");
      toast.success(copy.posted);
    },
    onError: (error) => {
      if (error.message === "RULES_NOT_ACCEPTED") {
        toast.error(copy.rules);
        return;
      }
      if (error.message === "CLASSROOM_NOT_FOUND") {
        toast.error(copy.classroomMissing);
        return;
      }
      toast.error(error.message);
    },
  });

  const asking = rows.find((row) => row.role.id === askingId)?.role ?? null;
  const visibleHelp = help.filter((row) => row.communitySlug === previewSlug);

  function move(roleId: string, status: TrackingStatus) {
    const previous = rows;
    setRows((current) =>
      current.map((row) => (row.role.id === roleId ? { ...row, status } : row)),
    );
    setStatus.mutate({ roleId, status }, { onError: () => setRows(previous) });
  }

  function remove(roleId: string) {
    const previous = rows;
    setRows((current) => current.filter((row) => row.role.id !== roleId));
    if (askingId === roleId) setAskingId(null);
    removeTrack.mutate(
      { roleId, applying: false },
      { onError: () => setRows(previous) },
    );
  }

  function openHelp(roleId: string) {
    setAskingId(roleId);
    setNote("");
    setClassroom("");
    setCommunitySlug(communities[0]?.slug ?? "");
  }

  function postHelp(roleId: string) {
    const text = note.trim();
    if (!text || !communitySlug || askHelp.isPending) return;
    askHelp.mutate({
      roleId,
      communitySlug,
      note: text,
      classroom: classroom.trim(),
      locale: helpLocale,
    });
  }

  return (
    <div data-startup-jobs-board="">
      <SectionLabel as="div">{copy.kicker}</SectionLabel>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {copy.title}
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed">
            {copy.lead}
          </p>
        </div>
        <Link
          href={STARTUPS_JOBS_PATH}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          {copy.open}
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-10 max-w-xl text-sm leading-relaxed">
          {copy.empty}
        </p>
      ) : (
        <div
          className="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-5"
          data-startup-board=""
        >
          {TRACKING_STATUSES.map((status) => {
            const column = rows.filter((row) => row.status === status);
            return (
              <section key={status} className="flex min-w-0 flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                    {statusLabel(copy, status)}
                  </h2>
                  <span className="text-muted-foreground font-mono text-xs">
                    {column.length}
                  </span>
                </div>
                {column.map(({ role }) => (
                  <article
                    key={role.id}
                    data-startup-board-card={role.slug}
                    className="border-border flex flex-col gap-3 rounded-xl border p-4"
                  >
                    <RoleLine role={role} />
                    <Label className="sr-only" htmlFor={`status-${role.id}`}>
                      {statusLabel(copy, status)}
                    </Label>
                    <Select
                      value={status}
                      onValueChange={(value) =>
                        move(role.id, value as TrackingStatus)
                      }
                    >
                      <SelectTrigger
                        id={`status-${role.id}`}
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {TRACKING_STATUSES.map((id) => (
                            <SelectItem key={id} value={id}>
                              {statusLabel(copy, id)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openHelp(role.id)}
                      >
                        {copy.ask}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(role.id)}
                      >
                        {copy.remove}
                      </Button>
                    </div>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}

      {help.length > 0 ? (
        <section className="mt-16" data-startup-board-help="">
          <SectionLabel as="h2">{copy.helpTitle}</SectionLabel>
          {communities.length > 1 ? (
            <div className="mt-4 flex max-w-sm flex-col gap-2">
              <Label htmlFor="help-preview">{copy.helpPick}</Label>
              <Select value={previewSlug} onValueChange={setPreviewSlug}>
                <SelectTrigger id="help-preview">
                  <SelectValue placeholder={copy.helpPick} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {communities.map((community) => (
                      <SelectItem key={community.slug} value={community.slug}>
                        {community.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <ul className="mt-4 flex max-w-xl flex-col gap-3">
            {visibleHelp.map((row) => {
              const role = rows.find(
                (item) => item.role.id === row.roleId,
              )?.role;
              if (!role) return null;
              return (
                <li
                  key={`${row.roleId}-${row.communitySlug}`}
                  data-startup-help-request={role.slug}
                  className="border-border flex flex-col gap-1 rounded-xl border p-4"
                >
                  <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                    {copy.member}
                  </p>
                  <p className="font-medium">{role.title}</p>
                  <p className="text-muted-foreground text-sm">
                    {role.startupName}
                  </p>
                  <p className="text-sm leading-relaxed">{row.note}</p>
                  {row.classroom ? (
                    <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                      {row.classroom}
                    </p>
                  ) : null}
                  <Link
                    href={row.path as never}
                    className="text-sm hover:underline"
                  >
                    {copy.viewPost}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <Sheet
        open={asking !== null}
        onOpenChange={(open) => {
          if (!open) setAskingId(null);
        }}
      >
        <SheetContent className="sm:max-w-md" data-startup-help-sheet="">
          {asking ? (
            <>
              <SheetHeader>
                <SheetTitle>{copy.ask}</SheetTitle>
                <SheetDescription>
                  {asking.title} · {asking.startupName}. {copy.sheetLead}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`community-${asking.id}`}>
                    {copy.community}
                  </Label>
                  {communities.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {copy.communityEmpty}
                    </p>
                  ) : (
                    <Select
                      value={communitySlug}
                      onValueChange={setCommunitySlug}
                    >
                      <SelectTrigger id={`community-${asking.id}`}>
                        <SelectValue placeholder={copy.community} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {communities.map((community) => (
                            <SelectItem
                              key={community.slug}
                              value={community.slug}
                            >
                              {community.name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`note-${asking.id}`}>{copy.note}</Label>
                  <Textarea
                    id={`note-${asking.id}`}
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`classroom-${asking.id}`}>
                    {copy.classroom}
                  </Label>
                  <Input
                    id={`classroom-${asking.id}`}
                    value={classroom}
                    placeholder={copy.classroom}
                    onChange={(event) => setClassroom(event.target.value)}
                  />
                  <p className="text-muted-foreground text-xs">
                    {copy.classroomHelp}
                  </p>
                </div>
              </div>
              <SheetFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!note.trim() || !communitySlug || askHelp.isPending}
                  onClick={() => postHelp(asking.id)}
                >
                  {askHelp.isPending ? copy.posting : copy.post}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setAskingId(null)}
                >
                  {copy.cancel}
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function RoleLine({ role }: { role: StartupRolePublic }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Link
        href={buildStartupRolePath(role.slug)}
        className="font-medium hover:underline"
      >
        {role.title}
      </Link>
      <Link
        href={buildStartupProfilePath(role.startupSlug)}
        className="text-muted-foreground text-sm hover:underline"
      >
        {role.startupName}
      </Link>
      {role.location || role.workType ? (
        <p className="text-muted-foreground text-sm">
          {[role.location, role.workType].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
