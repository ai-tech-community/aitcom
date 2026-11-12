"use client";

import { useDeferredValue, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ConnectionType } from "@/lib/communities/matching";
import { MemberIdentity, type MatchIdentity } from "./member-identity";

function ParticipantPicker({
  slug,
  label,
  value,
  onChange,
  exclude,
}: {
  slug: string;
  label: string;
  value: MatchIdentity | null;
  exclude?: string;
  onChange: (value: MatchIdentity | null) => void;
}) {
  const t = useTranslations("communityMatching");
  const id = useId();
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const query = api.communityMatching.participants.useInfiniteQuery(
    { slug, q },
    { getNextPageParam: (page) => page.nextCursor, enabled: !value },
  );
  const members =
    query.data?.pages
      .flatMap((page) => page.items)
      .filter((member) => member.userId !== exclude) ?? [];
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
          <MemberIdentity member={value} fallback={t("memberFallback")} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            {t("change")}
          </Button>
        </div>
      ) : (
        <>
          <Label htmlFor={id} className="sr-only">
            {t("searchParticipants", { label })}
          </Label>
          <Input
            id={id}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
            placeholder={t("searchByName")}
          />
          {query.isPending ? (
            <Skeleton className="h-20" />
          ) : query.isError ? (
            <ErrorState onRetry={query.refetch} />
          ) : (
            <>
              <div
                className="max-h-56 overflow-y-auto rounded-lg border"
                role="group"
                aria-label={label}
              >
                {members.map((member) => (
                  <Button
                    key={member.userId}
                    type="button"
                    variant="ghost"
                    className="h-auto w-full justify-start rounded-none px-3 py-3"
                    onClick={() => onChange(member)}
                  >
                    <MemberIdentity
                      member={member}
                      fallback={t("memberFallback")}
                    />
                  </Button>
                ))}
                {!members.length && (
                  <p className="text-muted-foreground p-4 text-sm">
                    {t("noParticipants")}
                  </p>
                )}
              </div>
              {query.isFetchNextPageError && (
                <p role="alert" className="text-destructive text-sm">
                  {t("loadMoreFailed")}
                </p>
              )}
              {query.hasNextPage && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  {t("loadMore")}
                </Button>
              )}
            </>
          )}
        </>
      )}
    </fieldset>
  );
}

export type IntroductionDraft = {
  a: MatchIdentity;
  b: MatchIdentity;
  reason: string;
  connectionTypeId?: string;
};

export function ProposeIntroduction({
  slug,
  types,
  draft,
  onClose,
}: {
  slug: string;
  types: ConnectionType[];
  draft?: IntroductionDraft;
  onClose: () => void;
}) {
  const t = useTranslations("communityMatching");
  const utils = api.useUtils();
  const id = useId();
  const [a, setA] = useState<MatchIdentity | null>(draft?.a ?? null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const [b, setB] = useState<MatchIdentity | null>(draft?.b ?? null);
  const [reason, setReason] = useState(draft?.reason ?? "");
  const [typeId, setTypeId] = useState(draft?.connectionTypeId ?? "none");
  const propose = api.communityMatching.propose.useMutation({
    onSuccess: () => {
      toast.success(t("introductionProposed"));
      void utils.communityMatching.suggestions.invalidate({ slug });
      void utils.communityMatching.history.invalidate({ slug });
      void utils.advisory.myPendingIntroductions.invalidate();
      onClose();
    },
  });
  return (
    <form
      className="space-y-5 rounded-lg border p-4 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (a && b && a.userId !== b.userId && reason.trim())
          propose.mutate({
            slug,
            userIdA: a.userId,
            userIdB: b.userId,
            reason: reason.trim(),
            connectionTypeId: typeId === "none" ? undefined : typeId,
          });
      }}
    >
      <div>
        <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">
          {t("reviewIntroduction")}
        </h3>
        <p className="text-muted-foreground mt-1 max-w-prose text-sm">
          {t("consentHelp")}
        </p>
      </div>
      <fieldset disabled={propose.isPending} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <ParticipantPicker
            slug={slug}
            label={t("firstMember")}
            value={a}
            exclude={b?.userId}
            onChange={setA}
          />
          <ParticipantPicker
            slug={slug}
            label={t("secondMember")}
            value={b}
            exclude={a?.userId}
            onChange={setB}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-type`}>{t("connectionType")}</Label>
          <Select value={typeId} onValueChange={setTypeId}>
            <SelectTrigger id={`${id}-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("generalIntroduction")}</SelectItem>
              {types
                .filter((type) => type.active)
                .map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${id}-reason`}>{t("introductionReason")}</Label>
          <Textarea
            id={`${id}-reason`}
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            aria-describedby={`${id}-reason-help`}
          />
          <p id={`${id}-reason-help`} className="text-muted-foreground text-xs">
            {t("reasonHelp")}
          </p>
        </div>
      </fieldset>
      {propose.isError && (
        <p role="alert" className="text-destructive text-sm">
          {propose.error.message === "MATCHING_INTRO_EXISTS"
            ? t("introExists")
            : propose.error.message === "MATCHING_MEMBERS_CHANGED"
              ? t("membersChanged")
              : t("proposeFailed")}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          disabled={
            propose.isPending ||
            !a ||
            !b ||
            a.userId === b.userId ||
            !reason.trim()
          }
        >
          {propose.isPending ? t("proposing") : t("proposeIntroduction")}
        </Button>
        <Button
          variant="ghost"
          type="button"
          disabled={propose.isPending}
          onClick={onClose}
        >
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
