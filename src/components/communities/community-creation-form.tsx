"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { COMMUNITY_DESCRIPTION_MAX } from "@/lib/communities/description";
import { cn } from "@/lib/utils";
import { isPublicCommunity } from "@/server/communities/content-visibility";
import { generateSlug } from "@/server/communities/slug-utils";
import { CommunityCreationPreview } from "./community-creation-preview";
import { useCreationAddress } from "./use-creation-address";

const JOIN_OPTIONS = ["open", "approval_required", "invite_only"] as const;
type JoinPolicy = (typeof JOIN_OPTIONS)[number];

type CreationInput = {
  name: string;
  slug?: string;
  description?: string;
  joinPolicy: JoinPolicy;
  isListedInDirectory: boolean;
};

const focus =
  "focus-visible:border-foreground focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const addressChoice = cn(
  "h-auto min-h-11 max-w-full min-w-0 text-start wrap-anywhere whitespace-normal shadow-none",
  focus,
);

export function CommunityCreationForm({
  pending,
  problem,
  onClose,
  onIdentityChange,
  onCreate,
}: {
  pending: boolean;
  problem: "conflict" | "name" | "create" | null;
  onClose: () => void;
  onIdentityChange: (name: string, address: string) => void;
  onCreate: (input: CreationInput) => void;
}) {
  const t = useTranslations("redesign.creation");
  const id = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const editAddressRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const [name, setName] = useState("");
  const [customAddress, setCustomAddress] = useState<string | null>(null);
  const [editingAddress, setEditingAddress] = useState(false);
  const [description, setDescription] = useState("");
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>("open");
  const [listed, setListed] = useState(true);
  const trimmedName = name.trim();
  const {
    address,
    status: addressStatus,
    alternatives,
    checkingAlternatives,
    canUseNameAddress,
  } = useCreationAddress({
    name: trimmedName,
    customAddress,
    conflict: problem === "conflict",
    suffixes: [t("suggestedSuffix.club"), t("suggestedSuffix.collective"), "2"],
  });
  const invalidName = Boolean(name) && trimmedName.length < 2;
  const canCreate =
    trimmedName.length >= 2 &&
    problem !== "name" &&
    (addressStatus === "clear" || addressStatus === "checkFailed");
  const submitDisabled = pending || !canCreate;
  const nameHelpId = `${id}-name-help`;

  useEffect(() => {
    if (editingAddress) addressRef.current?.focus();
  }, [editingAddress]);

  function useNameAddress() {
    setCustomAddress(null);
    onIdentityChange(trimmedName, generateSlug(trimmedName));
    closeAddressEditor();
  }

  function closeAddressEditor() {
    setEditingAddress(false);
    editAddressRef.current?.focus();
  }

  const publicContent = isPublicCommunity({
    slug: address,
    isListedInDirectory: listed,
    joinPolicy,
  });
  const listingSummary = listed
    ? publicContent
      ? "publicSummary"
      : "listedSummary"
    : "unlistedSummary";
  const accessSummary = t(listingSummary, {
    joining: t(`joining.${joinPolicy}`),
  });

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-black/85 backdrop-blur-[2px] motion-reduce:animate-none"
        className="flex max-h-[calc(100dvh-1.5rem)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-xl border-0 p-0 motion-reduce:animate-none sm:max-w-[54rem]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (document.activeElement instanceof HTMLElement) {
            opener.current = document.activeElement;
          }
          if (window.matchMedia("(pointer: coarse)").matches)
            headingRef.current?.focus();
          else nameRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
      >
        <div className="shrink-0 border-b px-5 pt-4 pb-3.5 sm:px-8 sm:pt-8 sm:pb-6">
          <DialogTitle
            ref={headingRef}
            tabIndex={-1}
            className="pr-10 text-3xl leading-tight tracking-tight outline-none sm:text-4xl"
          >
            {t("title")}
          </DialogTitle>
          <DialogDescription className="mt-2 max-w-[50ch] text-sm leading-relaxed sm:text-base">
            {t("intro")}
          </DialogDescription>
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={pending}
              className={cn(
                "absolute top-3 right-3 size-11 sm:top-5 sm:right-5",
                focus,
              )}
              aria-label={t("close")}
            >
              <X aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>

        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!submitDisabled) {
              onCreate({
                name: trimmedName,
                ...(customAddress === null ? {} : { slug: customAddress }),
                description: description || undefined,
                joinPolicy,
                isListedInDirectory: listed,
              });
            }
          }}
        >
          <div
            data-community-create-fields=""
            className="grid min-h-0 items-start gap-x-8 gap-y-3 overflow-y-auto px-5 py-3.5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] sm:grid-rows-[auto_1fr] sm:gap-y-5 sm:px-8 sm:py-7"
          >
            <div>
              <Label htmlFor={`${id}-name`} className="mb-2">
                {t("name")}
              </Label>
              <Input
                id={`${id}-name`}
                ref={nameRef}
                className={cn(
                  "border-muted-foreground h-11 shadow-none",
                  focus,
                )}
                value={name}
                placeholder={t("namePlaceholder")}
                required
                maxLength={100}
                disabled={pending}
                aria-invalid={invalidName || problem === "name" || undefined}
                aria-describedby={nameHelpId}
                onChange={(event) => {
                  const value = event.target.value;
                  setName(value);
                  onIdentityChange(
                    value.trim(),
                    customAddress ?? generateSlug(value),
                  );
                }}
              />
              <div
                id={nameHelpId}
                aria-live="polite"
                className="mt-2 min-h-5 text-sm leading-snug"
              >
                {invalidName || problem === "name" ? (
                  <p className="text-destructive">
                    {t(invalidName ? "nameShort" : "nameTaken")}
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    {t(customAddress === null ? "nameHelp" : "nameHelpCustom")}
                  </p>
                )}
              </div>
            </div>

            <CommunityCreationPreview
              name={trimmedName}
              address={address}
              status={addressStatus}
              editing={editingAddress}
              custom={customAddress !== null}
              disabled={pending}
              recovery={
                addressStatus === "taken" ? (
                  <div
                    className="mt-2 flex flex-wrap gap-2"
                    aria-label={t("suggestions")}
                    role="group"
                  >
                    {checkingAlternatives && alternatives.length === 0 ? (
                      <>
                        <Skeleton className="h-11 w-44 max-w-full" />
                        <Skeleton className="h-11 w-48 max-w-full" />
                      </>
                    ) : (
                      alternatives.map((slug) => (
                        <Button
                          key={slug}
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          className={addressChoice}
                          onClick={() => {
                            setCustomAddress(slug);
                            onIdentityChange(trimmedName, slug);
                            closeAddressEditor();
                          }}
                        >
                          {slug}
                        </Button>
                      ))
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!canUseNameAddress || pending}
                      className={addressChoice}
                      onClick={useNameAddress}
                    >
                      {t("useNameAddress")}
                    </Button>
                  </div>
                ) : null
              }
              hasRecoveryChoice={
                checkingAlternatives ||
                alternatives.length > 0 ||
                canUseNameAddress
              }
              inputRef={addressRef}
              editRef={editAddressRef}
              onEdit={() => setEditingAddress(true)}
              onDone={closeAddressEditor}
              onUseName={useNameAddress}
              onChange={(value) => {
                setCustomAddress(value);
                onIdentityChange(trimmedName, value);
              }}
            />

            <details className="group rounded-lg border">
              <summary
                className={cn(
                  "hover:bg-muted flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 marker:hidden [&::-webkit-details-marker]:hidden",
                  focus,
                )}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {t("settings")}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-sm leading-snug">
                    {accessSummary}
                  </span>
                </span>
                <ChevronDown
                  className="text-muted-foreground size-4 shrink-0 group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="space-y-3 border-t p-3">
                <div>
                  <Label htmlFor={`${id}-description`} className="mb-2">
                    {t("description")}
                  </Label>
                  <Textarea
                    id={`${id}-description`}
                    rows={2}
                    maxLength={COMMUNITY_DESCRIPTION_MAX}
                    value={description}
                    disabled={pending}
                    onChange={(event) => setDescription(event.target.value)}
                    className={cn("border-muted-foreground shadow-none", focus)}
                  />
                </div>
                <div>
                  <Label htmlFor={`${id}-joining`} className="mb-2">
                    {t("joinLabel")}
                  </Label>
                  <Select
                    value={joinPolicy}
                    onValueChange={(value) =>
                      setJoinPolicy(value as JoinPolicy)
                    }
                    disabled={pending}
                  >
                    <SelectTrigger
                      id={`${id}-joining`}
                      className={cn(
                        "border-muted-foreground w-full shadow-none data-[size=default]:h-11",
                        focus,
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent
                      position="popper"
                      className="motion-reduce:animate-none"
                    >
                      {JOIN_OPTIONS.map((policy) => (
                        <SelectItem
                          className="min-h-11"
                          key={policy}
                          value={policy}
                        >
                          {t(`joining.${policy}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="relative flex min-h-11 items-center gap-2.5">
                  <Checkbox
                    id={`${id}-listed`}
                    tone="ink"
                    checked={listed}
                    onCheckedChange={(value) => setListed(value === true)}
                    disabled={pending}
                    className={cn("border-muted-foreground", focus)}
                  />
                  <Label
                    htmlFor={`${id}-listed`}
                    className="after:absolute after:inset-0"
                  >
                    {t("listLabel")}
                  </Label>
                </div>
              </div>
            </details>
          </div>

          <div className="shrink-0 border-t px-5 py-3 sm:px-8 sm:py-4">
            {problem === "create" && (
              <p role="alert" className="text-destructive mb-3 text-sm">
                {t("createError")}
              </p>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div>
                <p className="text-sm font-semibold">{t("freeTitle")}</p>
                <p className="text-muted-foreground mt-0.5 text-sm leading-snug">
                  {t("freeDetail")}
                </p>
              </div>
              <Button
                type="submit"
                disabled={submitDisabled}
                variant={submitDisabled ? "secondary" : "default"}
                className={cn(
                  "h-11 disabled:opacity-100 motion-reduce:transition-none sm:min-w-48",
                  submitDisabled
                    ? "text-muted-foreground"
                    : "text-foreground dark:text-background",
                  focus,
                )}
              >
                {pending ? t("creating") : t("submit")}
                {pending ? (
                  <Skeleton
                    aria-hidden="true"
                    className="bg-background/50 size-4 motion-reduce:animate-none"
                  />
                ) : (
                  <ArrowRight aria-hidden="true" />
                )}
              </Button>
            </div>
            <span className="sr-only" role="status">
              {pending && t("creating")}
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
