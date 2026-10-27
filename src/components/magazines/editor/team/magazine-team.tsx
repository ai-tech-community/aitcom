"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "@/i18n/navigation";
import { getInitials } from "@/lib/avatar";
import { communityMagazinePath } from "@/lib/magazines/paths";
import {
  isMagazineRole,
  MAGAZINE_ROLES,
  roleCan,
  type MagazineRole,
} from "@/lib/magazines/roles";
import type {
  StaffCandidate,
  StaffMember,
} from "@/server/magazines/staff-service";
import { api } from "@/trpc/react";

import { readEditorError, type EditorErrorKey } from "../editor-errors";

/** The same jobs and explanations for adding someone and changing a job. */
function TeamJob({
  value,
  onChange,
  busy,
  memberNameId,
}: {
  value: MagazineRole | "";
  onChange: (role: MagazineRole, trigger: HTMLButtonElement | null) => void;
  busy: boolean;
  memberNameId?: string;
}) {
  const t = useTranslations("magazineEditor.team");
  const roles = useTranslations("magazineEditor.roles");
  const id = useId();
  const trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label id={`${id}-label`} htmlFor={id}>
        {t("roleLabel")}
      </Label>
      <Select
        value={value}
        onValueChange={(next) => {
          if (!busy && isMagazineRole(next)) onChange(next, trigger.current);
        }}
      >
        <SelectTrigger
          id={id}
          ref={trigger}
          aria-disabled={busy}
          aria-labelledby={
            memberNameId ? `${memberNameId} ${id}-label` : `${id}-label`
          }
          aria-describedby={value ? `${id}-help` : undefined}
          onPointerDown={(event) => {
            if (busy) event.preventDefault();
          }}
          onKeyDown={(event) => {
            if (
              busy &&
              ["Enter", " ", "ArrowUp", "ArrowDown"].includes(event.key)
            )
              event.preventDefault();
          }}
          className="w-full min-w-0 shadow-none"
        >
          <SelectValue placeholder={t("roleLabel")}>
            {value ? roles(`${value}.name`) : null}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-2rem)]">
          {MAGAZINE_ROLES.map((role) => (
            <SelectItem
              key={role}
              value={role}
              className="max-w-sm whitespace-normal"
            >
              <span className="flex min-w-0 flex-col items-start gap-1">
                <span>{roles(`${role}.name`)}</span>
                <span className="text-muted-foreground text-xs">
                  {roles(`${role}.help`)}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <p
          id={`${id}-help`}
          className="text-muted-foreground max-w-prose text-xs"
        >
          {roles(`${value}.help`)}
        </p>
      )}
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function MagazineTeam({ slug }: { slug: string }) {
  const t = useTranslations("magazineEditor.team");
  const roles = useTranslations("magazineEditor.roles");
  const tErrors = useTranslations("magazineEditor.errors");
  const id = useId();
  const router = useRouter();
  const utils = api.useUtils();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [person, setPerson] = useState<StaffCandidate | null>(null);
  const [role, setRole] = useState<MagazineRole | "">("");
  const [removing, setRemoving] = useState<StaffMember | null>(null);
  const [changingSelf, setChangingSelf] = useState<{
    member: StaffMember;
    role: MagazineRole;
  } | null>(null);
  const [error, setError] = useState<EditorErrorKey | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [focusAfterAssign, setFocusAfterAssign] = useState(0);
  const inFlight = useRef(false);
  const removeTrigger = useRef<HTMLButtonElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const assignmentTrigger = useRef<HTMLButtonElement | null>(null);
  const restoreAssignmentFocus = useCallback(() => {
    const target = assignmentTrigger.current?.isConnected
      ? assignmentTrigger.current
      : searchInput.current;
    target?.focus();
  }, []);
  useEffect(() => {
    if (focusAfterAssign === 0) return;
    restoreAssignmentFocus();
  }, [focusAfterAssign, restoreAssignmentFocus]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const staff = api.magazines.listStaff.useQuery({ slug });
  const searching = query.trim().length > 0;
  const settled = searching && debounced === query.trim();
  const candidates = api.magazines.searchStaffCandidates.useQuery(
    { slug, query: debounced },
    { enabled: settled },
  );
  const changed = () => {
    inFlight.current = false;
    void utils.magazines.listStaff.invalidate({ slug });
    void utils.magazines.searchStaffCandidates.invalidate({ slug });
  };
  const refused = (cause: unknown) => {
    inFlight.current = false;
    setError(readEditorError(cause).key);
  };
  const assign = api.magazines.assignStaffRole.useMutation({
    onSuccess: (assigned) => {
      if (changingSelf) {
        inFlight.current = false;
        router.push(communityMagazinePath(slug));
        return;
      }
      setAnnouncement(t(`assigned.${assigned.role}`, { name: assigned.name }));
      if (person?.userId === assigned.userId) {
        setPerson(null);
        setRole("");
        setQuery("");
        assignmentTrigger.current = null;
      }
      setFocusAfterAssign((request) => request + 1);
      changed();
    },
    onError: refused,
  });
  const remove = api.magazines.removeStaffRole.useMutation({
    onSuccess: () => {
      if (removing?.isViewer && roleCan(removing.role, "manage")) {
        inFlight.current = false;
        router.push(communityMagazinePath(slug));
        return;
      }
      if (removing) setAnnouncement(t("removed", { name: removing.name }));
      // The refetch removes this row; restore focus to a stable control.
      removeTrigger.current = null;
      setRemoving(null);
      changed();
    },
    onError: refused,
  });
  const busy = assign.isPending || remove.isPending;
  const assignJob = (userId: string, next: MagazineRole) => {
    if (busy || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setAnnouncement("");
    assign.mutate({ slug, userId, role: next });
  };
  const changeJob = (
    member: StaffMember,
    next: MagazineRole,
    trigger: HTMLButtonElement | null,
  ) => {
    if (busy || inFlight.current) return;
    assignmentTrigger.current = trigger;
    if (
      member.isViewer &&
      roleCan(member.role, "manage") &&
      !roleCan(next, "manage")
    ) {
      setError(null);
      setChangingSelf({ member, role: next });
      return;
    }
    assignJob(member.userId, next);
  };
  const confirmRemove = () => {
    if (!removing || busy || inFlight.current) return;
    inFlight.current = true;
    setError(null);
    setAnnouncement("");
    remove.mutate({ slug, userId: removing.userId });
  };
  const refusal = error && (
    <p role="alert" className="text-destructive text-sm">
      {tErrors(error)}
    </p>
  );
  const resultsReady =
    settled &&
    !candidates.isFetching &&
    !candidates.isError &&
    candidates.data !== undefined;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <p role="status" aria-live="polite" className="text-sm">
        {announcement}
      </p>
      {!removing && !changingSelf && refusal}
      <section
        aria-labelledby={`${id}-add`}
        className="flex min-w-0 flex-col gap-4"
      >
        <SectionLabel as="h2" id={`${id}-add`}>
          {t("add")}
        </SectionLabel>
        <form
          className="flex min-w-0 flex-col items-start gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (person && role && resultsReady) assignJob(person.userId, role);
          }}
        >
          <div className="flex w-full min-w-0 flex-col gap-2">
            <Label htmlFor={`${id}-search`}>{t("searchLabel")}</Label>
            <Input
              ref={searchInput}
              id={`${id}-search`}
              value={query}
              maxLength={100}
              aria-disabled={busy}
              aria-describedby={`${id}-hint`}
              onChange={(event) => {
                if (busy || inFlight.current) return;
                setQuery(event.target.value);
                setPerson(null);
              }}
            />
            <p id={`${id}-hint`} className="text-muted-foreground text-sm">
              {t("searchHint")}
            </p>
          </div>
          {searching && (
            <div className="w-full min-w-0">
              {!settled || candidates.isLoading || candidates.isFetching ? (
                <TeamSkeleton />
              ) : candidates.isError ? (
                <ErrorState onRetry={() => void candidates.refetch()} />
              ) : (
                resultsReady && (
                  <fieldset className="flex min-w-0 flex-col gap-2">
                    <legend className="mb-2 text-sm font-medium">
                      {t("resultsLegend")}
                    </legend>
                    {candidates.data.map((candidate, index) => (
                      <label
                        key={candidate.userId}
                        htmlFor={`${id}-candidate-${index}`}
                        className="hover:bg-secondary/50 flex min-w-0 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm"
                      >
                        <input
                          id={`${id}-candidate-${index}`}
                          type="radio"
                          name={`${id}-candidate`}
                          value={candidate.userId}
                          checked={person?.userId === candidate.userId}
                          aria-disabled={busy}
                          onClick={(event) => {
                            if (busy || inFlight.current)
                              event.preventDefault();
                          }}
                          onChange={() => {
                            if (!busy && !inFlight.current)
                              setPerson(candidate);
                          }}
                          className="accent-foreground focus-visible:ring-ring size-4 shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2"
                        />
                        <span className="min-w-0 break-words">
                          {candidate.name}
                        </span>
                      </label>
                    ))}
                    {candidates.data.length === 0 && (
                      <p className="text-muted-foreground text-sm">
                        {t("noResults")}
                      </p>
                    )}
                  </fieldset>
                )
              )}
              <p
                role="status"
                aria-live="polite"
                className="text-muted-foreground mt-2 text-sm"
              >
                {resultsReady
                  ? t("resultCount", { count: candidates.data.length })
                  : ""}
              </p>
            </div>
          )}
          <div className="w-full max-w-sm min-w-0">
            <TeamJob value={role} onChange={setRole} busy={busy} />
          </div>
          <Button
            type="submit"
            disabled={!busy && (!person || !role || !resultsReady)}
            aria-disabled={busy || !person || !role || !resultsReady}
            className="h-auto min-h-9 max-w-full whitespace-normal"
          >
            {t("addButton")}
          </Button>
        </form>
      </section>
      <section
        aria-labelledby={`${id}-team`}
        className="flex min-w-0 flex-col gap-4"
      >
        <SectionLabel as="h2" id={`${id}-team`}>
          {t("membersTitle")}
        </SectionLabel>
        {staff.isLoading ? (
          <TeamSkeleton />
        ) : staff.isError ? (
          <ErrorState onRetry={() => void staff.refetch()} />
        ) : staff.data?.length ? (
          <ul className="min-w-0 divide-y border-y">
            {staff.data.map((member, index) => (
              <li
                key={member.userId}
                aria-labelledby={`${id}-member-${index}`}
                className="flex min-w-0 flex-wrap items-start gap-3 py-4"
              >
                <Avatar>
                  <AvatarImage src={member.image ?? undefined} alt="" />
                  <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-1">
                  <p
                    id={`${id}-member-${index}`}
                    className="text-sm font-medium break-words"
                  >
                    {member.name}
                  </p>
                  {member.isViewer && (
                    <p className="text-muted-foreground text-sm">{t("you")}</p>
                  )}
                  <p className="text-muted-foreground text-sm">
                    {member.source === "assigned"
                      ? roles(`${member.role}.name`)
                      : t(member.source)}
                  </p>
                  {!member.isActiveMember && (
                    <p className="text-muted-foreground text-sm">
                      {t("notMember")}
                    </p>
                  )}
                </div>
                {member.source === "assigned" && (
                  <div className="flex w-full min-w-0 flex-wrap items-end gap-2">
                    {member.isActiveMember && (
                      <div className="min-w-0 flex-1">
                        <TeamJob
                          value={member.role}
                          memberNameId={`${id}-member-${index}`}
                          onChange={(next, trigger) =>
                            changeJob(member, next, trigger)
                          }
                          busy={busy}
                        />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      aria-disabled={busy}
                      aria-label={t("removeNamed", { name: member.name })}
                      onClick={(event) => {
                        if (busy || inFlight.current) return;
                        removeTrigger.current = event.currentTarget;
                        setError(null);
                        setRemoving(member);
                      }}
                    >
                      {t("remove")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        )}
      </section>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setRemoving(null);
        }}
      >
        <AlertDialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = removeTrigger.current?.isConnected
              ? removeTrigger.current
              : searchInput.current;
            target?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="break-words">
              {t("removeTitle", { name: removing?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                removing?.isViewer && roleCan(removing.role, "manage")
                  ? "removeSelfBody"
                  : "removeBody",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {refusal}
          <AlertDialogFooter>
            <AlertDialogCancel
              aria-disabled={busy}
              onClick={(event) => {
                if (busy || inFlight.current) event.preventDefault();
              }}
            >
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              aria-disabled={busy}
              onClick={confirmRemove}
            >
              {t("removeConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={changingSelf !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setChangingSelf(null);
        }}
      >
        <AlertDialogContent
          className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreAssignmentFocus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t("loseAccessTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("loseAccessBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {refusal}
          <AlertDialogFooter>
            <AlertDialogCancel
              aria-disabled={busy}
              onClick={(event) => {
                if (busy || inFlight.current) event.preventDefault();
              }}
            >
              {t("cancel")}
            </AlertDialogCancel>
            <Button
              type="button"
              variant="ink"
              aria-disabled={busy}
              onClick={() => {
                if (changingSelf)
                  assignJob(changingSelf.member.userId, changingSelf.role);
              }}
            >
              {t("loseAccessConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
