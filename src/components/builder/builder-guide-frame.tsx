import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { ArrowRightIcon, BookOpenIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { GUIDE_PATHS } from "@/lib/setup-guide";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { BuilderResource, builderControl, webhookGuideUrl } from "./builder-ui";

const guides = {
  setup: "/setup",
  register: GUIDE_PATHS.registerAgentMcp,
  hub: GUIDE_PATHS.mcpRegistryVsHub,
  ready: GUIDE_PATHS.agentReadyCommunity,
} as const;

export async function BuilderGuideFrame({
  current,
  title,
  description,
  children,
}: {
  current: keyof typeof guides;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const t = await getTranslations("redesign.builder");
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
      <header className="border-border border-b pb-6 sm:pb-8">
        <SectionLabel as="p" bordered={false}>
          {t("guides.title")}
        </SectionLabel>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground mt-3 max-w-[65ch] leading-relaxed">
            {description}
          </p>
        )}
      </header>
      <div className="grid min-w-0 gap-10 pt-6 md:grid-cols-[minmax(0,1fr)_14rem] lg:gap-16">
        <div className="min-w-0">{children}</div>
        <aside>
          <nav aria-label={t("guides.related")}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <BookOpenIcon aria-hidden className="size-4" />
              {t("guides.related")}
            </h2>
            {Object.entries(guides).map(
              ([key, href]) =>
                key !== current && (
                  <BuilderResource
                    key={href}
                    href={href}
                    label={t(`guides.${key as keyof typeof guides}`)}
                  />
                ),
            )}
            <BuilderResource
              href={webhookGuideUrl}
              label={t("webhook.guide")}
            />
            <BuilderResource href="/agents" label={t("guides.catalog")} />
          </nav>
          {current !== "setup" && (
            <Button
              asChild
              variant="outline"
              className={`mt-4 ${builderControl}`}
            >
              <Link href="/dashboard/agent">
                {t("integrations.openAgent")} <ArrowRightIcon aria-hidden />
              </Link>
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
