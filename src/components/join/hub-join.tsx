import { Link } from "@/i18n/navigation";
import { PromoteJoinCta } from "@/components/join/promote-join-cta";
import { SectionLabel } from "@/components/ui/section-label";
import { GUIDE_PATHS } from "@/lib/seo-guides";

export type HubJoinKey =
  | "kicker"
  | "title"
  | "lead"
  | "memberKicker"
  | "memberTitle"
  | "memberLead"
  | "cta"
  | "hubCta"
  | "homeLabel"
  | "guideLabel";

export function HubJoin({
  t,
  signupHref,
  promoteJoin = true,
}: {
  t: (key: HubJoinKey) => string;
  signupHref: string;
  promoteJoin?: boolean;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <SectionLabel as="div">
        {promoteJoin ? t("kicker") : t("memberKicker")}
      </SectionLabel>

      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {promoteJoin ? t("title") : t("memberTitle")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {promoteJoin ? t("lead") : t("memberLead")}
        </p>
        <div className="pt-2">
          <PromoteJoinCta
            promoteJoin={promoteJoin}
            guestHref={signupHref}
            guestLabel={t("cta")}
            hubLabel={t("hubCta")}
          />
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          <Link href="/" className="underline-offset-4 hover:underline">
            {t("homeLabel")}
          </Link>
          <span aria-hidden="true"> · </span>
          <Link
            href={GUIDE_PATHS.registerAgentMcp}
            className="underline-offset-4 hover:underline"
          >
            {t("guideLabel")}
          </Link>
        </p>
      </div>
    </div>
  );
}
