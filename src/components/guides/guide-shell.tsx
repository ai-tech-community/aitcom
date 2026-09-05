import type { ReactNode } from "react";

import { SectionLabel } from "@/components/ui/section-label";
import {
  AGENT_REGISTER_URL,
  MCP_ENDPOINT,
  hubHomeUrl,
  hubJoinUrl,
  setupGuideUrl,
} from "@/lib/seo-guides";

export function GuideShell({
  kicker,
  title,
  lead,
  children,
}: {
  kicker: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <SectionLabel as="div">{kicker}</SectionLabel>

      <div className="mt-8 max-w-2xl space-y-4">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          {title}
        </h1>
        <p className="text-muted-foreground text-lg leading-relaxed">{lead}</p>
      </div>

      {children}
    </div>
  );
}

export function GuideSection({
  label,
  children,
  first = false,
}: {
  label: string;
  children: ReactNode;
  first?: boolean;
}) {
  return (
    <section className={`${first ? "mt-16" : "mt-12"} max-w-2xl space-y-4`}>
      <SectionLabel>{label}</SectionLabel>
      {children}
    </section>
  );
}

export function GuideBody({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-sm leading-relaxed">{children}</p>
  );
}

export function CitationLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      aria-label={label}
      className="border-border hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-ring/50 block rounded-xl border p-6 shadow-sm transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
    >
      <span className="block text-sm font-semibold">{label}</span>
      <span
        aria-hidden="true"
        className="text-muted-foreground mt-2 block font-mono text-xs break-all"
      >
        {href}
      </span>
    </a>
  );
}

export type DoorCopy = {
  doorsTitle: string;
  doorsLead: string;
  hubHomeLabel: string;
  joinLabel: string;
};

export function HubDoorLinks({
  locale,
  doors,
  extra,
}: {
  locale: string;
  doors: DoorCopy;
  extra?: Array<{ href: string; label: string }>;
}) {
  const links = [
    { href: hubHomeUrl(locale), label: doors.hubHomeLabel },
    { href: hubJoinUrl(locale), label: doors.joinLabel },
    ...(extra ?? []),
  ];

  return (
    <section className="mt-16 space-y-4">
      <SectionLabel>{doors.doorsTitle}</SectionLabel>
      <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
        {doors.doorsLead}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((link) => (
          <CitationLink key={link.href} href={link.href} label={link.label} />
        ))}
      </div>
    </section>
  );
}

export function doorCopyFrom(t: (key: keyof DoorCopy) => string): DoorCopy {
  return {
    doorsTitle: t("doorsTitle"),
    doorsLead: t("doorsLead"),
    hubHomeLabel: t("hubHomeLabel"),
    joinLabel: t("joinLabel"),
  };
}

export function liveCiteHrefs(locale: string) {
  return {
    setup: setupGuideUrl(locale),
    agentMd: AGENT_REGISTER_URL,
    mcp: MCP_ENDPOINT,
  };
}
