"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { filterScopesByManifest } from "@/server/agent/manifest";
import { BuilderFailure, BuilderRetry } from "./builder-ui";

const scopeLabels = {
  read: "read",
  "self-profile": "profile",
  contribute: "contribute",
  collect: "collect",
  "commission:claim-cell": "claim",
  "commission:submit-result": "submit",
} as const;

export function BuilderKeyPermissions({ scopes }: { scopes: string[] }) {
  const t = useTranslations("redesign.builder");
  const manifest = api.agentManagement.getManifest.useQuery();
  const ungated = filterScopesByManifest(scopes, false);
  const known = Object.entries(scopeLabels).filter(([scope]) =>
    scopes.includes(scope),
  );
  return (
    <div className="border-border space-y-2 border-t pt-3 @2xl:border-s @2xl:border-t-0 @2xl:ps-5 @2xl:pt-0">
      <h3 className="text-sm font-semibold">{t("key.permissions.title")}</h3>
      {known.length > 0 ? (
        <ul className="text-muted-foreground list-disc space-y-1 ps-5 text-sm">
          {known.map(([scope, label]) => (
            <li key={scope}>
              {t(`key.permissions.${label}`)}
              {!ungated.includes(scope) && !manifest.data?.accepted && (
                <span className="text-foreground ms-1 font-medium">
                  {t(
                    manifest.data
                      ? "key.permissions.blocked"
                      : "key.permissions.unconfirmed",
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("key.permissions.empty")}
        </p>
      )}
      {manifest.data?.accepted === false &&
        ungated.length !== scopes.length && (
          <Link
            className="hover:bg-muted focus-visible:outline-ring inline-flex min-h-11 items-center rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2 sm:min-h-9"
            href="/dashboard/agent?tab=connect"
          >
            {t("key.permissions.review")}
          </Link>
        )}
      {manifest.isError && ungated.length !== scopes.length && (
        <BuilderFailure
          reason={t("key.permissions.loadFailedTitle")}
          status={manifest.error?.data?.httpStatus}
          action={
            <BuilderRetry
              label={t("retry")}
              onClick={() => void manifest.refetch()}
            />
          }
        >
          {t("key.permissions.loadFailed")}
        </BuilderFailure>
      )}
      <div>
        <Link
          className="hover:bg-muted focus-visible:outline-ring inline-flex min-h-11 items-center rounded-sm text-sm font-medium underline underline-offset-4 focus-visible:outline-2 sm:min-h-9"
          href="/agents"
        >
          {t("guides.catalog")}
        </Link>
      </div>
    </div>
  );
}
