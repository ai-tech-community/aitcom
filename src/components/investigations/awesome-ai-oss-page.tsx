import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { AwesomeAiOssDirectory } from "@/components/investigations/awesome-ai-oss-directory";
import {
  AWESOME_AI_OSS_JOIN_HREF,
  curatedPublicCards,
  type AwesomeDirectoryQuery,
  type AwesomeLocale,
  type AwesomePublicCard,
} from "@/lib/investigations/awesome-ai-oss";
import { GUIDE_PATHS } from "@/lib/seo-guides";

export type AwesomeAiOssKey =
  | "kicker"
  | "title"
  | "lead"
  | "backLink"
  | "hubVsRegistryTitle"
  | "hubVsRegistryBody"
  | "hubVsRegistryLink"
  | "howWePickTitle"
  | "howWePickBody"
  | "protocols"
  | "runtimes"
  | "frameworks"
  | "models"
  | "other"
  | "gitlab"
  | "gitlabNote"
  | "joinTitle"
  | "joinLead"
  | "joinCta"
  | "registerAgentLabel";

export function AwesomeAiOssPage({
  locale,
  t,
  projects = curatedPublicCards(),
  signedIn = false,
  isModerator = false,
  query = { q: "", category: "all", sort: "newest" },
  signInHref = "/en/auth/signin?redirect=/en/investigations/awesome-ai-oss",
}: {
  locale: string;
  t: (key: AwesomeAiOssKey) => string;
  projects?: AwesomePublicCard[];
  signedIn?: boolean;
  isModerator?: boolean;
  query?: AwesomeDirectoryQuery;
  signInHref?: string;
}) {
  const copyLocale: AwesomeLocale = locale === "nl" ? "nl" : "en";

  return (
    <main className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <nav className="text-muted-foreground text-xs">
        <Link
          href="/investigations"
          className="hover:text-foreground hover:underline"
        >
          ← {t("backLink")}
        </Link>
      </nav>

      <SectionLabel as="div" className="mt-8">
        {t("kicker")}
      </SectionLabel>

      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {t("title")}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">
          {t("lead")}
        </p>
      </div>

      <section className="mt-16 max-w-2xl space-y-4">
        <SectionLabel>{t("hubVsRegistryTitle")}</SectionLabel>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("hubVsRegistryBody")}{" "}
          <Link
            href={GUIDE_PATHS.mcpRegistryVsHub}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            {t("hubVsRegistryLink")}
          </Link>
        </p>
      </section>

      <section className="mt-12 max-w-2xl space-y-4">
        <SectionLabel>{t("howWePickTitle")}</SectionLabel>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("howWePickBody")}
        </p>
      </section>

      <section className="mt-12">
        <AwesomeAiOssDirectory
          projects={projects}
          signedIn={signedIn}
          isModerator={isModerator}
          locale={copyLocale}
          initialQuery={query}
          signInHref={signInHref}
        />
      </section>

      <section className="mt-16 max-w-2xl space-y-4">
        <SectionLabel>{t("joinTitle")}</SectionLabel>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("joinLead")}
        </p>
        <div className="pt-2">
          <Button asChild variant="outline">
            <a href={AWESOME_AI_OSS_JOIN_HREF}>{t("joinCta")}</a>
          </Button>
        </div>
        <p
          aria-hidden="true"
          className="text-muted-foreground font-mono text-xs break-all"
        >
          {AWESOME_AI_OSS_JOIN_HREF}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          <Link
            href={GUIDE_PATHS.registerAgentMcp}
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            {t("registerAgentLabel")}
          </Link>
        </p>
      </section>
    </main>
  );
}
