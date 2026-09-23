"use client";

import { useMemo, useState } from "react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  buildStartupProfilePath,
  buildStartupRolePath,
} from "@/lib/investigations/startups";
import type { StartupRolePublic } from "@/lib/investigations/startup-roles";

export const TRACKING_STATUSES = [
  "applying",
  "applied",
  "talking",
  "offer",
  "passed",
] as const;

export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

export type TrackingHelp = {
  roleId: string;
  communitySlug: string;
  note: string;
  classroom: string;
};

const COPY = {
  en: {
    kicker: "Jobs",
    title: "Your board",
    lead: "Track sourced roles you are pursuing. This board is private to your dashboard. A help request goes to one community you belong to, with your note and an optional classroom.",
    preview: "Private to your dashboard. Nothing is saved yet.",
    open: "Open positions",
    track: "Track",
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
    helpTitle: "What the community sees",
    helpEmpty: "No requests for this community yet.",
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
    lead: "Volg geverifieerde rollen waar je mee bezig bent. Dit bord is privé in je dashboard. Een hulpvraag gaat naar één community waar je lid van bent, met je notitie en een optioneel classroom.",
    preview: "Privé in je dashboard. Er wordt nog niets opgeslagen.",
    open: "Open posities",
    track: "Volgen",
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
    helpTitle: "Wat de community ziet",
    helpEmpty: "Nog geen vragen voor deze community.",
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
  roles,
  communities,
}: {
  locale: string;
  roles: StartupRolePublic[];
  communities: { slug: string; name: string }[];
}) {
  const copy = locale === "nl" ? COPY.nl : COPY.en;
  const [statusByRole, setStatusByRole] = useState<
    Record<string, TrackingStatus>
  >({});
  const [askingId, setAskingId] = useState<string | null>(null);
  const [communitySlug, setCommunitySlug] = useState(
    communities[0]?.slug ?? "",
  );
  const [note, setNote] = useState("");
  const [classroom, setClassroom] = useState("");
  const [help, setHelp] = useState<TrackingHelp[]>([]);
  const [previewSlug, setPreviewSlug] = useState(communities[0]?.slug ?? "");

  const tracked = useMemo(
    () => roles.filter((role) => statusByRole[role.id]),
    [roles, statusByRole],
  );
  const open = roles.filter((role) => !statusByRole[role.id]);
  const visibleHelp = help.filter((row) => row.communitySlug === previewSlug);

  function track(roleId: string) {
    setStatusByRole((current) => ({ ...current, [roleId]: "applying" }));
  }

  function postHelp(roleId: string) {
    const text = note.trim();
    if (!text || !communitySlug) return;
    setHelp((current) => [
      {
        roleId,
        communitySlug,
        note: text,
        classroom: classroom.trim(),
      },
      ...current.filter(
        (row) =>
          !(row.roleId === roleId && row.communitySlug === communitySlug),
      ),
    ]);
    setPreviewSlug(communitySlug);
    setAskingId(null);
    setNote("");
    setClassroom("");
  }

  return (
    <div data-startup-jobs-board="">
      <SectionLabel as="div">{copy.kicker}</SectionLabel>
      <div className="mt-6 flex max-w-2xl flex-col gap-2">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {copy.title}
        </h2>
        <p className="text-muted-foreground text-base leading-relaxed">
          {copy.lead}
        </p>
        <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
          {copy.preview}
        </p>
      </div>

      <section className="mt-10" data-startup-board-open="">
        <SectionLabel as="h2">{copy.open}</SectionLabel>
        <ul className="mt-4 flex flex-col gap-2">
          {open.map((role) => (
            <li
              key={role.id}
              className="border-border flex flex-wrap items-baseline justify-between gap-3 border-b py-3"
            >
              <RoleLine role={role} />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => track(role.id)}
              >
                {copy.track}
              </Button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10" data-startup-board="">
        <div className="grid gap-4 lg:grid-cols-5">
          {TRACKING_STATUSES.map((status) => (
            <div key={status} className="flex flex-col gap-3">
              <h2 className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                {statusLabel(copy, status)}
              </h2>
              {tracked
                .filter((role) => statusByRole[role.id] === status)
                .map((role) => (
                  <article
                    key={role.id}
                    data-startup-board-card={role.slug}
                    className="border-border flex flex-col gap-3 rounded-xl border p-3"
                  >
                    <RoleLine role={role} />
                    <Label className="sr-only" htmlFor={`status-${role.id}`}>
                      {statusLabel(copy, status)}
                    </Label>
                    <Select
                      value={status}
                      onValueChange={(value) =>
                        setStatusByRole((current) => ({
                          ...current,
                          [role.id]: value as TrackingStatus,
                        }))
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
                    {askingId === role.id ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`community-${role.id}`}>
                          {copy.community}
                        </Label>
                        <Select
                          value={communitySlug}
                          onValueChange={setCommunitySlug}
                        >
                          <SelectTrigger id={`community-${role.id}`}>
                            <SelectValue placeholder={copy.community} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {communities.length === 0 ? (
                                <SelectItem value="none" disabled>
                                  {copy.communityEmpty}
                                </SelectItem>
                              ) : (
                                communities.map((community) => (
                                  <SelectItem
                                    key={community.slug}
                                    value={community.slug}
                                  >
                                    {community.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <Label htmlFor={`note-${role.id}`}>{copy.note}</Label>
                        <Textarea
                          id={`note-${role.id}`}
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                        />
                        <Label htmlFor={`classroom-${role.id}`}>
                          {copy.classroom}
                        </Label>
                        <Input
                          id={`classroom-${role.id}`}
                          value={classroom}
                          placeholder={copy.classroom}
                          onChange={(event) => setClassroom(event.target.value)}
                        />
                        <p className="text-muted-foreground text-xs">
                          {copy.classroomHelp}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={!note.trim() || !communitySlug}
                            onClick={() => postHelp(role.id)}
                          >
                            {copy.post}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setAskingId(null)}
                          >
                            {copy.cancel}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAskingId(role.id);
                            setNote("");
                            setClassroom("");
                          }}
                        >
                          {copy.ask}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setStatusByRole((current) => {
                              const next = { ...current };
                              delete next[role.id];
                              return next;
                            })
                          }
                        >
                          {copy.remove}
                        </Button>
                      </div>
                    )}
                  </article>
                ))}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16" data-startup-board-help="">
        <SectionLabel as="h2">{copy.helpTitle}</SectionLabel>
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
        {visibleHelp.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">{copy.helpEmpty}</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {visibleHelp.map((row) => {
              const role = roles.find((item) => item.id === row.roleId);
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
                </li>
              );
            })}
          </ul>
        )}
      </section>
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
        <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
          {[role.location, role.workType].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
