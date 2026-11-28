import { useId, type ReactNode, type Ref } from "react";
import { useTranslations } from "next-intl";
import { Check, Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_COMMUNITY_THEME_ID,
  resolveCommunityTheme,
} from "@/lib/communities/themes";
import { cn } from "@/lib/utils";
import { COMMUNITY_SLUG_MAX_LENGTH } from "@/server/communities/slug-utils";
import { CommunitySetupBadge } from "./community-setup-badge";
import { communityPublicUrl } from "./create-community-link";
import { CommunityCoverArt } from "./theme/community-cover-art";
import type { useCreationAddress } from "./use-creation-address";

const focus =
  "focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

export function CommunityCreationPreview({
  name,
  address,
  status,
  editing,
  custom,
  disabled,
  recovery,
  hasRecoveryChoice,
  inputRef,
  editRef,
  onEdit,
  onDone,
  onUseName,
  onChange,
}: {
  name: string;
  address: string;
  status: ReturnType<typeof useCreationAddress>["status"];
  editing: boolean;
  custom: boolean;
  disabled: boolean;
  recovery: ReactNode;
  hasRecoveryChoice: boolean;
  inputRef: Ref<HTMLInputElement>;
  editRef: Ref<HTMLButtonElement>;
  onEdit: () => void;
  onDone: () => void;
  onUseName: () => void;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("redesign.creation");
  const theme = resolveCommunityTheme(DEFAULT_COMMUNITY_THEME_ID);
  const id = useId();
  const addressBase = communityPublicUrl("/communities/");
  const taken = status === "taken";
  const formatInvalid = custom && status === "invalid";
  const noDerivedAddress = !custom && status === "invalid" && name.length >= 2;
  const issueId = `${id}-issue`;
  const inputId = `${id}-input`;
  const hintId = `${inputId}-hint`;
  const editorId = `${inputId}-editor`;
  const displayName = name || t("previewName");

  return (
    <div className="min-w-0 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:border-l sm:pl-8">
      <SectionLabel bordered={false} className="mb-2.5">
        {t("preview")}
      </SectionLabel>
      <div
        className="overflow-hidden rounded-lg border"
        style={{ borderColor: theme.tokens.border }}
      >
        <CommunityCoverArt themeId={theme.id} className="h-16 sm:h-24" />
        <div
          data-community-preview-theme={theme.id}
          className="flex min-h-20 items-center gap-3 border-b px-3 py-3 sm:px-4"
          style={{
            backgroundColor: theme.tokens.background,
            color: theme.tokens.foreground,
            borderColor: theme.tokens.border,
          }}
        >
          <CommunitySetupBadge name={displayName} theme={theme} />
          <div className="min-w-0">
            <p
              className="line-clamp-2 text-lg leading-tight font-semibold tracking-tight wrap-anywhere sm:text-xl"
              title={name || undefined}
            >
              {displayName}
            </p>
          </div>
        </div>
        <div
          className={cn(
            "rounded-b-lg px-3 pt-1 pb-2.5 sm:px-4 sm:pb-3",
            taken && !editing && "ring-destructive ring-1 ring-inset",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Link2 className="size-3.5" aria-hidden="true" />
              {t("address")}
            </p>
            <Button
              ref={editRef}
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled || (editing && formatInvalid)}
              aria-expanded={editing}
              aria-controls={editorId}
              aria-describedby={taken || noDerivedAddress ? issueId : undefined}
              className={cn("min-h-11 px-2.5 font-medium", focus)}
              onClick={editing ? onDone : onEdit}
            >
              {t(editing ? "doneEditingAddress" : "editAddress")}
            </Button>
          </div>
          <div id={editorId} hidden={!editing}>
            {editing && (
              <>
                <div
                  className="text-muted-foreground mb-1 text-xs wrap-anywhere"
                  dir="ltr"
                >
                  {addressBase}
                </div>
                <Label htmlFor={inputId} className="sr-only">
                  {t("customAddress")}
                </Label>
                <Input
                  ref={inputRef}
                  id={inputId}
                  value={address}
                  dir="ltr"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoComplete="off"
                  maxLength={COMMUNITY_SLUG_MAX_LENGTH}
                  disabled={disabled}
                  aria-invalid={formatInvalid || taken || undefined}
                  aria-describedby={
                    taken || noDerivedAddress ? issueId : hintId
                  }
                  className={cn(
                    "border-muted-foreground focus-visible:border-foreground aria-invalid:focus-visible:border-destructive h-11 shadow-none",
                    focus,
                    (formatInvalid || taken) &&
                      "focus-visible:outline-destructive",
                  )}
                  onChange={(event) => onChange(event.target.value)}
                />
                {!taken && !noDerivedAddress && (
                  <p
                    id={hintId}
                    className={cn(
                      "mt-1.5 text-xs leading-snug",
                      formatInvalid
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {t("addressFormat")}
                  </p>
                )}
              </>
            )}
          </div>
          {!editing && address && (
            <p
              className={cn(
                "text-xs leading-relaxed tracking-tight wrap-anywhere",
                taken && "text-destructive",
              )}
              dir="ltr"
              title={`${addressBase}${address}`}
            >
              <span className="text-muted-foreground">{addressBase}</span>
              <strong className="font-semibold">{address}</strong>
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-2">
            <div aria-live="polite" className="mt-1.5 text-sm empty:mt-0">
              {taken || noDerivedAddress ? (
                <div id={issueId} className="text-destructive leading-snug">
                  {taken ? (
                    <>
                      {!editing && (
                        <p className="mb-1 flex items-center gap-1.5 font-medium">
                          <X className="size-3.5" aria-hidden="true" />
                          {t("addressStatus.inUse")}
                        </p>
                      )}
                      <p>
                        {t(
                          hasRecoveryChoice
                            ? "addressStatus.taken"
                            : "addressStatus.takenNoChoices",
                        )}
                      </p>
                    </>
                  ) : (
                    t("nameNoAddress")
                  )}
                </div>
              ) : status === "checking" ? (
                <>
                  <Skeleton
                    aria-hidden="true"
                    className="h-3.5 w-32 motion-reduce:animate-none"
                  />
                  <span className="sr-only">{t("addressStatus.checking")}</span>
                </>
              ) : status === "clear" ? (
                <p className="text-success flex items-center gap-1.5 font-medium">
                  <Check className="size-4" aria-hidden="true" />
                  <span>{t("addressStatus.clear")}</span>
                </p>
              ) : status === "empty" || status === "checkFailed" ? (
                <p className="text-muted-foreground">
                  {t(`addressStatus.${status}`)}
                </p>
              ) : null}
            </div>
            {editing && custom && !taken && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                className={cn("min-h-11 px-2.5", focus)}
                onClick={onUseName}
              >
                {t("useNameAddress")}
              </Button>
            )}
          </div>
          {taken && recovery}
        </div>
      </div>
    </div>
  );
}
