import { getTranslations } from "next-intl/server";
import {
  ArrowRightIcon,
  BracesIcon,
  DownloadIcon,
  PlugIcon,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  AGENT_REGISTER_URL,
  CLONE_COMMAND,
  DOCKER_COMMAND,
  HUB_CLONE_URL,
  MCP_ENDPOINT,
} from "@/lib/setup-guide";
import { BuilderGuideFrame } from "./builder-guide-frame";
import { BuilderCode } from "./builder-code";
import {
  BuilderDisclosure,
  BuilderPanel,
  BuilderResource,
  builderControl,
} from "./builder-ui";

export async function BuilderSetupGuide() {
  const [t, setup] = await Promise.all([
    getTranslations("redesign.builder"),
    getTranslations("setup"),
  ]);
  return (
    <BuilderGuideFrame
      current="setup"
      title={t("setup.title")}
      description={t("setup.description")}
    >
      <div className="[&>section:first-child]:border-t-0 [&>section:first-child]:pt-0">
        <BuilderPanel
          id="hosted-agent"
          title={t("setup.hosted")}
          icon={BracesIcon}
          description={t("setup.hostedHelp")}
        >
          <Button asChild variant="ink" className={builderControl}>
            <Link href="/dashboard/agent">
              {t("integrations.openAgent")} <ArrowRightIcon aria-hidden />
            </Link>
          </Button>
        </BuilderPanel>
        <BuilderPanel
          id="agent-registration"
          title={t("setup.register")}
          icon={PlugIcon}
          description={t("setup.registerHelp")}
        >
          <BuilderCode label={setup("mcpLabel")} value={MCP_ENDPOINT} />
        </BuilderPanel>
        <BuilderPanel
          id="self-host"
          title={t("setup.forDevelopers")}
          description={t("setup.developerHelp")}
        >
          <div className="border-border divide-border divide-y border-y">
            <BuilderDisclosure
              title={t("setup.registrationReference")}
              icon={PlugIcon}
            >
              <div className="space-y-4 pb-3">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {setup("agentBody")}
                </p>
                <ol className="text-foreground marker:text-foreground ms-5 list-decimal space-y-1.5 text-sm leading-relaxed marker:font-mono marker:font-semibold">
                  <li>{setup("agentStep1")}</li>
                  <li>{setup("agentStep2")}</li>
                  <li>{setup("agentStep3")}</li>
                  <li>{setup("agentStep4")}</li>
                </ol>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {setup("agentInvite")}
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {setup("agentGuide")}
                </p>
                <BuilderResource
                  href={AGENT_REGISTER_URL}
                  label={setup("agentLinkLabel")}
                />
              </div>
            </BuilderDisclosure>
            <BuilderDisclosure title={t("setup.selfHost")} icon={DownloadIcon}>
              <div className="space-y-5 pb-3">
                <ol className="marker:text-foreground ms-5 list-decimal space-y-5 marker:font-mono marker:font-semibold">
                  <li className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      {setup("cloneTitle")}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {setup("cloneBody")}
                    </p>
                    <BuilderCode
                      label={setup("cloneCommandLabel")}
                      value={CLONE_COMMAND}
                    />
                  </li>
                  <li className="space-y-2">
                    <h3 className="text-sm font-semibold">
                      {setup("dockerTitle")}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {setup("dockerBody")}
                    </p>
                    <BuilderCode
                      label={setup("dockerCommandLabel")}
                      value={DOCKER_COMMAND}
                    />
                    <p className="text-muted-foreground text-sm leading-relaxed">
                      {setup("macosNote")}
                    </p>
                  </li>
                </ol>
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">
                    {setup("manualTitle")}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {setup("manualBody")}
                  </p>
                  <BuilderResource
                    href={HUB_CLONE_URL}
                    label={setup("cloneLinkLabel")}
                  />
                </div>
              </div>
            </BuilderDisclosure>
          </div>
        </BuilderPanel>
      </div>
    </BuilderGuideFrame>
  );
}
