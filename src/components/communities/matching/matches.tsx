"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import type { ConnectionType } from "@/lib/communities/matching";
import { MemberIdentity } from "./member-identity";
import {
  ProposeIntroduction,
  type IntroductionDraft,
} from "./propose-introduction";

export function CommunityMatches({
  slug,
  types,
}: {
  slug: string;
  types: ConnectionType[];
}) {
  const t = useTranslations("communityMatching");
  const utils = api.useUtils();
  const [typeId, setTypeId] = useState("all");
  const [memberId, setMemberId] = useState("all");
  const [draft, setDraft] = useState<IntroductionDraft | "manual" | null>(null);
  const query = api.communityMatching.suggestions.useQuery({
    slug,
    typeId: typeId === "all" ? undefined : typeId,
    memberId: memberId === "all" ? undefined : memberId,
  });
  const dismiss = api.communityMatching.dismiss.useMutation({
    onSuccess: () => {
      void utils.communityMatching.suggestions.invalidate({ slug });
    },
    onError: () => toast.error(t("saveFailed")),
  });
  const restore = api.communityMatching.restoreDismissed.useMutation({
    onSuccess: () => {
      void utils.communityMatching.suggestions.invalidate({ slug });
    },
    onError: () => toast.error(t("saveFailed")),
  });
  const active = types.filter((type) => type.active);
  const members = query.data?.members ?? [];
  const name = (id: string) =>
    members.find((m) => m.userId === id)?.displayName ?? t("memberFallback");
  if (query.isPending)
    return (
      <div className="space-y-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  if (query.isError) return <ErrorState onRetry={query.refetch} />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t("matchesTitle")}</h2>
          <p className="text-muted-foreground mt-1 max-w-prose text-sm">
            {t("matchesDescription")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active.length > 0 && (
            <Button variant="ghost" asChild>
              <Link href={`/communities/${slug}/settings/matching`}>
                {t("matchingSettings")}
              </Link>
            </Button>
          )}
          {!draft && (
            <Button variant="outline" onClick={() => setDraft("manual")}>
              {t("manualIntroduction")}
            </Button>
          )}
        </div>
      </div>
      {draft && (
        <ProposeIntroduction
          key={
            draft === "manual"
              ? "manual"
              : `${draft.a.userId}|${draft.b.userId}`
          }
          slug={slug}
          types={types}
          draft={draft === "manual" ? undefined : draft}
          onClose={() => setDraft(null)}
        />
      )}
      {active.length === 0 ? (
        <EmptyState
          icon={<UsersRound />}
          title={t("setupTitle")}
          description={t("setupDescription")}
          action={
            <Button asChild>
              <Link href={`/communities/${slug}/settings/matching`}>
                {t("setupMatching")}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="match-type-filter">{t("connectionType")}</Label>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger id="match-type-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allTypes")}</SelectItem>
                  {active.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="match-member-filter">{t("findForMember")}</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger id="match-member-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allMembers")}</SelectItem>
                  {members.map((member) => (
                    <SelectItem key={member.userId} value={member.userId}>
                      {member.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-muted-foreground text-sm">
            {t("matchingCoverage", { count: query.data.scanned })}
            {query.data.total > query.data.scanned &&
              ` ${t("matchingLimit", { total: query.data.total })}`}
          </p>
          {query.data.matches.length === 0 ? (
            <EmptyState
              title={t("noMatches")}
              description={t("noMatchesDescription")}
            />
          ) : (
            <ul className="divide-y border-y">
              {query.data.matches.map((match) => {
                const a = members.find((m) => m.userId === match.userIdA)!;
                const b = members.find((m) => m.userId === match.userIdB)!;
                const reasons = match.reasons.map((reason) => ({
                  ...reason,
                  text:
                    reason.kind === "shared"
                      ? t("sharedReason", { topic: reason.topic })
                      : t("complementaryReason", {
                          offering: name(reason.offeringUserId!),
                          seeking: name(reason.seekingUserId!),
                          topic: reason.topic,
                        }),
                }));
                const reason = reasons
                  .map((r) => r.text)
                  .join("\n")
                  .slice(0, 1000);
                return (
                  <li key={match.pairKey} className="space-y-4 py-6">
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                      <MemberIdentity
                        member={a}
                        fallback={t("memberFallback")}
                      />
                      <ArrowRight
                        className="text-muted-foreground size-4 shrink-0"
                        aria-hidden="true"
                      />
                      <MemberIdentity
                        member={b}
                        fallback={t("memberFallback")}
                      />
                    </div>
                    <div>
                      <p className="mb-2 text-sm font-medium">
                        {t("whyConnect")}
                      </p>
                      <ul className="space-y-2">
                        {reasons.map((r, i) => (
                          <li
                            key={`${r.typeId}-${i}`}
                            className="text-muted-foreground text-sm"
                          >
                            <Badge
                              variant="outline"
                              className="me-2 mb-1 max-w-full whitespace-normal"
                            >
                              {types.find((type) => type.id === r.typeId)?.name}
                            </Badge>
                            {r.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {(match.sameCity !== null ||
                      match.languages.length > 0) && (
                      <p className="text-muted-foreground text-xs">
                        {[
                          match.sameCity
                            ? t("sameCity", { city: match.sameCity })
                            : null,
                          match.languages.length
                            ? t("sharedLanguages", {
                                languages: match.languages.join(", "),
                              })
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="ink"
                        size="sm"
                        disabled={!!draft}
                        onClick={() =>
                          setDraft({
                            a,
                            b,
                            reason,
                            connectionTypeId: match.reasons[0]?.typeId,
                          })
                        }
                      >
                        {t("reviewMatch")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={dismiss.isPending}
                        onClick={() =>
                          dismiss.mutate({
                            slug,
                            userIdA: a.userId,
                            userIdB: b.userId,
                          })
                        }
                      >
                        {t("dismiss")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      {query.data.dismissedCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          disabled={restore.isPending}
          onClick={() => restore.mutate({ slug })}
        >
          {t("restoreDismissed", { count: query.data.dismissedCount })}
        </Button>
      )}
    </div>
  );
}
