import { Link } from "@/i18n/navigation";
import { GUIDE_PATHS, JOIN_PATH } from "@/lib/seo-guides";

export type HubDoorsKey =
  | "kicker"
  | "joinLabel"
  | "joinDesc"
  | "registerLabel"
  | "registerDesc"
  | "registryLabel"
  | "registryDesc"
  | "agentReadyLabel"
  | "agentReadyDesc";

export const HOME_CRAWL_DOORS = [
  {
    href: JOIN_PATH,
    labelKey: "joinLabel",
    descKey: "joinDesc",
  },
  {
    href: GUIDE_PATHS.registerAgentMcp,
    labelKey: "registerLabel",
    descKey: "registerDesc",
  },
  {
    href: GUIDE_PATHS.mcpRegistryVsHub,
    labelKey: "registryLabel",
    descKey: "registryDesc",
  },
  {
    href: GUIDE_PATHS.agentReadyCommunity,
    labelKey: "agentReadyLabel",
    descKey: "agentReadyDesc",
  },
] as const;

export function HomeCrawlDoors({ t }: { t: (key: HubDoorsKey) => string }) {
  return (
    <section className="px-6 py-12 sm:px-12">
      <div className="border-border border-b pb-4">
        <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("kicker").toUpperCase()}
        </h2>
      </div>

      <div className="mt-2">
        {HOME_CRAWL_DOORS.map((door) => (
          <Link
            key={door.href}
            href={door.href}
            className="border-border hover:bg-secondary/50 flex flex-col gap-1 border-b px-4 py-3.5 transition-colors sm:flex-row sm:items-baseline sm:gap-6"
          >
            <span className="text-base leading-snug font-medium sm:w-72 sm:shrink-0">
              {t(door.labelKey)}
            </span>
            <span className="text-muted-foreground text-sm leading-relaxed">
              {t(door.descKey)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
