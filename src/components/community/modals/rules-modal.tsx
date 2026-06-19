"use client";

import { useTranslations, useLocale } from "next-intl";
import { api } from "@/trpc/react";
import { LexicalRenderer } from "@/lib/lexical";
import { BuildingModal } from "../building-modal";
import { Shield, Users, Flag, Scale, Brain, Gavel, Check } from "lucide-react";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  shield: Shield,
  users: Users,
  flag: Flag,
  scale: Scale,
  brain: Brain,
  gavel: Gavel,
};

type RulesModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  windowIndex?: number;
  communitySlug?: string;
};

export function RulesModal({
  isOpen,
  onClose,
  title,
  subtitle,
  windowIndex,
  communitySlug,
}: RulesModalProps) {
  const t = useTranslations("community.rules");
  const locale = useLocale() as "en" | "nl";
  const { data, isLoading } = api.forum.getRules.useQuery(
    { communitySlug: communitySlug ?? "ait", locale },
    { enabled: isOpen, staleTime: 5 * 60 * 1000 },
  );

  const utils = api.useUtils();
  const acceptMutation = api.forum.acceptRules.useMutation({
    onSuccess: () => {
      void utils.forum.getRules.invalidate();
    },
  });

  const rules = data?.rules;
  const sections = rules?.sections ?? [];
  const hasAccepted = data?.hasAccepted ?? false;

  return (
    <BuildingModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      windowIndex={windowIndex}
    >
      {isLoading && (
        <div className="space-y-3 py-4">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="bg-muted h-4 animate-pulse rounded" />
          ))}
        </div>
      )}

      {data && sections.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* Table of Contents */}
          <nav className="border-border bg-muted rounded-md border p-3">
            <p className="text-muted-foreground mb-2 font-mono text-xs font-medium tracking-wider uppercase">
              {t("toc")}
            </p>
            <ul className="space-y-1">
              {sections.map((section) => {
                const Icon = section.icon ? iconMap[section.icon] : null;
                return (
                  <li key={section.slug}>
                    <a
                      href={`#rule-${section.slug}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document
                          .getElementById(`rule-${section.slug}`)
                          ?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="text-foreground hover:bg-accent flex items-center gap-2 rounded px-2 py-1 text-sm transition-colors"
                    >
                      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                      {section.title}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Sections */}
          <div className="space-y-6">
            {sections.map((section) => {
              const Icon = section.icon ? iconMap[section.icon] : null;
              return (
                <section key={section.slug} id={`rule-${section.slug}`}>
                  <h2 className="text-foreground flex items-center gap-2 text-lg font-semibold">
                    {Icon && <Icon className="h-4.5 w-4.5 text-orange-500" />}
                    {section.title}
                  </h2>
                  <div className="prose prose-sm prose-headings:text-foreground prose-p:text-foreground prose-a:text-orange-600 mt-2 max-w-none">
                    <LexicalRenderer content={section.content} />
                  </div>
                </section>
              );
            })}
          </div>

          {/* Version & Acceptance Footer */}
          <div className="border-border mt-4 border-t pt-4">
            {rules?.version && (
              <p className="text-muted-foreground mb-2 font-mono text-xs">
                {t("versionLabel", { version: rules.version })}
              </p>
            )}

            {hasAccepted && data?.acceptedAt ? (
              <div className="bg-success/15 text-success flex items-center gap-2 rounded-md px-3 py-2 text-sm">
                <Check className="h-4 w-4" />
                {t("accepted", {
                  date: new Date(data.acceptedAt).toLocaleDateString(),
                })}
              </div>
            ) : (
              <button
                onClick={() =>
                  acceptMutation.mutate({
                    communitySlug: communitySlug ?? "ait",
                  })
                }
                disabled={acceptMutation.isPending}
                className="bg-foreground text-background hover:bg-foreground/90 w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {acceptMutation.isPending ? "..." : t("accept")}
              </button>
            )}
          </div>
        </div>
      )}

      {!isLoading && (!data || sections.length === 0) && (
        <p className="text-muted-foreground py-4 font-mono text-xs">
          {t("empty")}
        </p>
      )}
    </BuildingModal>
  );
}
