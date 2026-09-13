import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import {
  AWESOME_AI_OSS_CATEGORIES,
  AWESOME_AI_OSS_JOIN_HREF,
  type AwesomeLocale,
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
  | "gitlab"
  | "gitlabNote"
  | "joinTitle"
  | "joinLead"
  | "joinCta"
  | "registerAgentLabel";

export function AwesomeAiOssPage({
  locale,
  t,
}: {
  locale: string;
  t: (key: AwesomeAiOssKey) => string;
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

      {AWESOME_AI_OSS_CATEGORIES.map((category) => (
        <section key={category.id} className="mt-12 max-w-2xl space-y-4">
          <SectionLabel>{t(category.headingKey)}</SectionLabel>
          {category.id === "gitlab" ? (
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("gitlabNote")}
            </p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {category.repos.map((repo) => (
              <li key={repo.href}>
                <a
                  href={repo.href}
                  className="border-border hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-ring/50 block rounded-xl border p-6 shadow-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
                >
                  <span className="block font-mono text-sm font-medium break-all">
                    {repo.name}
                  </span>
                  <span className="text-muted-foreground mt-2 block text-sm leading-relaxed">
                    {repo.blurb[copyLocale]}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <section className="mt-16 max-w-2xl space-y-4">
        <SectionLabel>{t("joinTitle")}</SectionLabel>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("joinLead")}
        </p>
        <div className="pt-2">
          <Button asChild>
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
