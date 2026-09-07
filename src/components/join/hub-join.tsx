import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { GUIDE_PATHS } from "@/lib/seo-guides";

export type HubJoinKey =
  | "kicker"
  | "title"
  | "lead"
  | "cta"
  | "homeLabel"
  | "guideLabel";

export function HubJoin({
  t,
  signupHref,
}: {
  t: (key: HubJoinKey) => string;
  signupHref: string;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <SectionLabel as="div">{t("kicker")}</SectionLabel>

      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("lead")}
        </p>
        <div className="pt-2">
          <Button asChild>
            <Link href={signupHref}>{t("cta")}</Link>
          </Button>
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
