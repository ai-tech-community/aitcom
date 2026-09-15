import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import {
  AIT_COMMUNITY_ROLES_JOIN_HREF,
  HUB_DM_PATH,
  HUB_PEOPLE_PATH,
  HUB_WELCOME_THREAD_PATH,
  type ResolvedSeat,
  type SeatId,
} from "@/lib/investigations/ait-community-roles";

export type AitCommunityRolesKey =
  | "kicker"
  | "title"
  | "lead"
  | "claimCta"
  | "pathLead"
  | "welcomeLabel"
  | "peopleLabel"
  | "dmLabel"
  | "daysLeft"
  | "endingSoon"
  | "termNote"
  | "joinHint"
  | "hubHost"
  | "awesomeOssCurator"
  | "outreachCampus"
  | "agentPairChallenger";

const SEAT_TITLE_KEY: Record<SeatId, AitCommunityRolesKey> = {
  "hub-host": "hubHost",
  "awesome-oss-curator": "awesomeOssCurator",
  "outreach-campus": "outreachCampus",
  "agent-pair-challenger": "agentPairChallenger",
};

export function AitCommunityRolesPage({
  t,
  seats,
}: {
  t: (key: AitCommunityRolesKey, values?: { days: number }) => string;
  seats: ResolvedSeat[];
}) {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-16 sm:px-12">
      <SectionLabel as="div">{t("kicker")}</SectionLabel>

      <div className="flex max-w-2xl flex-col gap-3">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("lead")}
        </p>
      </div>

      <ol className="border-border divide-border divide-y rounded-xl border">
        {seats.map((seat) => (
          <li
            key={seat.id}
            className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-base leading-snug font-semibold">
                {t(SEAT_TITLE_KEY[seat.id])}
              </h2>
              {seat.empty ? null : (
                <p className="text-sm leading-relaxed">
                  {seat.holderName}
                  {seat.agentName ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {seat.agentName}
                    </span>
                  ) : null}
                </p>
              )}
            </div>

            {seat.empty ? (
              <Button asChild variant="outline">
                <a href={AIT_COMMUNITY_ROLES_JOIN_HREF}>{t("claimCta")}</a>
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {seat.urgent ? (
                  <Badge variant="warning">{t("endingSoon")}</Badge>
                ) : null}
                <span className="text-muted-foreground font-mono text-xs tracking-wider">
                  {t("daysLeft", { days: seat.daysLeft ?? 0 })}
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="text-muted-foreground flex max-w-2xl flex-col gap-2 text-sm leading-relaxed">
        <p>
          {t("pathLead")}{" "}
          <Link
            href={HUB_WELCOME_THREAD_PATH}
            className="underline-offset-4 hover:underline"
          >
            {t("welcomeLabel")}
          </Link>
          <span aria-hidden="true"> · </span>
          <Link
            href={HUB_PEOPLE_PATH}
            className="underline-offset-4 hover:underline"
          >
            {t("peopleLabel")}
          </Link>
          <span aria-hidden="true"> · </span>
          <Link
            href={HUB_DM_PATH}
            className="underline-offset-4 hover:underline"
          >
            {t("dmLabel")}
          </Link>
        </p>
        <p>{t("termNote")}</p>
        <p>{t("joinHint")}</p>
      </div>
    </main>
  );
}
