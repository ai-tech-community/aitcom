"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { authClient } from "@/server/better-auth/client";
import { getInitials } from "@/lib/avatar";
import { PROFILE_PHOTO_TYPES } from "@/lib/image-uploads";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

import {
  ProfilePhotoUploadError,
  uploadProfilePhoto,
} from "./upload-profile-photo";

const ACCEPT = Object.keys(PROFILE_PHOTO_TYPES).join(",");

/**
 * The member's picture at the top of the profile form: upload a new one or
 * remove it. Each change saves at once (the form's Save button is for the
 * text fields), and the navbar, the side panel's "You" card and this row
 * all pick it up without a reload. Removing asks first: a picture from a
 * sign-in provider does not come back by signing in again.
 */
export function ProfilePhotoSettings({
  name,
  photo,
}: {
  /** For the initials shown when there is no picture at all. */
  name: string;
  /** From `members.getMyProfile`. */
  photo: { url: string | null; isSet: boolean };
}) {
  const t = useTranslations("dashboard.profile.photo");
  const utils = api.useUtils();
  const session = authClient.useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [uploading, setUploading] = useState(false);

  // Everything that shows the picture: this row and the "You" card read
  // getMyProfile; the navbar reads the session.
  const showChange = () =>
    Promise.all([utils.members.getMyProfile.invalidate(), session.refetch()]);

  const remove = api.members.removeProfilePhoto.useMutation({
    onSuccess: async () => {
      await showChange();
      toast.success(t("removed"));
    },
    onError: () => toast.error(t("error")),
  });

  const busy = uploading || remove.isPending;

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cleared so choosing the same file again still fires a change.
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { image } = await uploadProfilePhoto(file);
      await showChange();
      // No picture: a remove in another tab settled after this upload began.
      if (image) toast.success(t("saved"));
      else toast.error(t("error"));
    } catch (error) {
      const reason =
        error instanceof ProfilePhotoUploadError ? error.reason : "failed";
      toast.error(
        reason === "type"
          ? t("errorType")
          : reason === "size"
            ? t("errorSize")
            : t("error"),
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {photo.url && <AvatarImage src={photo.url} alt="" />}
        <AvatarFallback className="font-mono text-base">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 space-y-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium">{t("label")}</p>
          <p id={hintId} className="text-muted-foreground text-xs">
            {t("hint")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-label={t("choose")}
            onChange={onFile}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            aria-describedby={hintId}
            onClick={() => inputRef.current?.click()}
          >
            {uploading
              ? t("uploading")
              : photo.isSet
                ? t("change")
                : t("upload")}
          </Button>
          {photo.isSet && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" size="sm" disabled={busy}>
                  {t("remove")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("removeDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>
                    {t("removeConfirm")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}
