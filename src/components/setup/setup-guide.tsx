import { SectionLabel } from "@/components/ui/section-label";
import {
  AGENT_REGISTER_URL,
  CLONE_COMMAND,
  DOCKER_COMMAND,
  HUB_CLONE_URL,
  MCP_ENDPOINT,
} from "@/lib/setup-guide";

type SetupKey =
  | "kicker"
  | "title"
  | "lead"
  | "cloneTitle"
  | "cloneBody"
  | "cloneCommandLabel"
  | "dockerTitle"
  | "dockerBody"
  | "dockerCommandLabel"
  | "macosNote"
  | "manualTitle"
  | "manualBody"
  | "agentTitle"
  | "agentBody"
  | "mcpLabel"
  | "agentStep1"
  | "agentStep2"
  | "agentStep3"
  | "agentStep4"
  | "agentInvite"
  | "agentGuide"
  | "linksTitle"
  | "linksLead"
  | "cloneLinkLabel"
  | "agentLinkLabel";

export function SetupGuide({ t }: { t: (key: SetupKey) => string }) {
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
      </div>

      <section className="mt-16 max-w-2xl space-y-4">
        <SectionLabel>{t("cloneTitle")}</SectionLabel>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("cloneBody")}
        </p>
        <CommandBlock label={t("cloneCommandLabel")} command={CLONE_COMMAND} />
      </section>

      <section className="mt-12 max-w-2xl space-y-4">
        <SectionLabel>{t("dockerTitle")}</SectionLabel>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("dockerBody")}
        </p>
        <CommandBlock
          label={t("dockerCommandLabel")}
          command={DOCKER_COMMAND}
        />
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("macosNote")}
        </p>
      </section>

      <section className="mt-12 max-w-2xl space-y-4">
        <SectionLabel>{t("manualTitle")}</SectionLabel>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("manualBody")}
        </p>
      </section>

      <section className="mt-12 max-w-2xl space-y-4">
        <SectionLabel>{t("agentTitle")}</SectionLabel>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("agentBody")}
        </p>
        <div>
          <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
            {t("mcpLabel")}
          </p>
          <code className="bg-foreground text-background mt-1 block w-fit rounded px-3 py-1.5 font-mono text-xs">
            {MCP_ENDPOINT}
          </code>
        </div>
        <ol className="text-muted-foreground list-inside list-decimal space-y-1.5 text-sm leading-relaxed">
          <li>{t("agentStep1")}</li>
          <li>{t("agentStep2")}</li>
          <li>{t("agentStep3")}</li>
          <li>{t("agentStep4")}</li>
        </ol>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("agentInvite")}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t("agentGuide")}
        </p>
      </section>

      <section className="mt-16 space-y-4">
        <SectionLabel>{t("linksTitle")}</SectionLabel>
        <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed">
          {t("linksLead")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <CitationLink href={HUB_CLONE_URL} label={t("cloneLinkLabel")} />
          <CitationLink href={AGENT_REGISTER_URL} label={t("agentLinkLabel")} />
        </div>
      </section>
    </div>
  );
}

function CommandBlock({ label, command }: { label: string; command: string }) {
  return (
    <div>
      <p className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
        {label}
      </p>
      <pre className="bg-foreground text-background mt-1 overflow-x-auto rounded px-3 py-2 font-mono text-xs">
        <code>{command}</code>
      </pre>
    </div>
  );
}

function CitationLink({ href, label }: { href: string; label: string }) {
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
