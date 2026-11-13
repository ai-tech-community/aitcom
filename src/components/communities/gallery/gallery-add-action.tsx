"use client";

import { useState } from "react";
import { ImagePlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CommunityRole } from "@/server/communities/role-utils";
import {
  viewerJoinAction,
  type JoinPolicy,
  type MembershipStatus,
} from "@/server/communities/invite-policy";

import { JoinButton } from "../join-button";

/** Who is looking at the gallery, as far as adding to it goes. */
export type GalleryViewerState =
  /** The memberships are not known (still loading, or failed to load). */
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "member"; role: CommunityRole }
  /** Signed in, not an active member (`status` is their membership row's). */
  | { kind: "outsider"; status: MembershipStatus | null };

/**
 * "Add photos and videos" for whoever is looking (DESIGN.md Gate-Before-
 * Fail: no one presses a button that then fails):
 * - members: the screen's one primary action; it opens the upload;
 * - guests: the sign-in prompt (they may be members once signed in);
 * - signed-in visitors who can join: the community's join control, in a
 *   small dialog that says why;
 * - anyone else (request pending, invite-only, banned, still loading):
 *   nothing.
 * For everyone but members the community frame's Join is the screen's
 * orange action (One Voice Rule), so the button is ink for them.
 */
export function GalleryAddAction({
  slug,
  communityName,
  joinPolicy,
  viewer,
  onUpload,
}: {
  slug: string;
  communityName?: string;
  joinPolicy: JoinPolicy;
  viewer: GalleryViewerState;
  onUpload: () => void;
}) {
  const t = useTranslations("gallery.page");
  const { requireAuth } = useRequireAuth();
  const [joinOpen, setJoinOpen] = useState(false);

  const button = (variant: "default" | "ink", onClick: () => void) => (
    <Button type="button" variant={variant} onClick={onClick}>
      <ImagePlus aria-hidden="true" />
      {t("add")}
    </Button>
  );

  switch (viewer.kind) {
    case "loading":
      return null;
    case "member":
      return button("default", onUpload);
    case "guest":
      return button("ink", () => requireAuth(onUpload, t("signInToAdd")));
    case "outsider": {
      const action = viewerJoinAction({ joinPolicy, status: viewer.status });
      const canJoin =
        action.kind === "join" ||
        action.kind === "request" ||
        action.kind === "invited";
      if (!canJoin) return null;
      return (
        <>
          {button("ink", () => setJoinOpen(true))}
          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("joinTitle")}</DialogTitle>
                <DialogDescription>{t("joinBody")}</DialogDescription>
              </DialogHeader>
              <div className="flex justify-end">
                <JoinButton
                  slug={slug}
                  name={communityName}
                  joinPolicy={joinPolicy}
                  membershipStatus={viewer.status}
                />
              </div>
            </DialogContent>
          </Dialog>
        </>
      );
    }
  }
}
