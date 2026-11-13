"use client";

import { useEffect, useRef } from "react";

import { useRequireAuth } from "@/components/auth/auth-required-dialog";

import type { GalleryViewerState } from "./gallery-add-action";

/**
 * Acts on an upload link (`?upload=1`, from an event's "Add yours" or a
 * guest's way back from signing in) once the viewer is known: a member gets
 * the upload, with the linked event; a guest the sign-in prompt, which
 * comes back to the same link; anyone else nothing. The link is dropped
 * from the URL once acted on — for a member when the upload closes — so a
 * refresh does not open it again. Acts once per link.
 */
export function useGalleryUploadLink({
  link,
  viewer,
  intent,
  openUpload,
  dropLink,
}: {
  link: { eventId: number | null } | null;
  viewer: GalleryViewerState;
  intent: string;
  openUpload: (eventId: number | null) => void;
  dropLink: () => void;
}) {
  const { promptAuth, authStatus } = useRequireAuth();
  const handled = useRef(false);
  const linked = link !== null;
  const eventId = link?.eventId ?? null;
  useEffect(() => {
    if (!linked) {
      handled.current = false;
      return;
    }
    if (handled.current) return;
    switch (viewer.kind) {
      case "loading":
        return;
      case "member":
        handled.current = true;
        openUpload(eventId);
        return;
      case "guest": {
        // Only a session known to be signed out is a guest.
        if (authStatus !== "guest") return;
        handled.current = true;
        const here = `${window.location.pathname}${window.location.search}`;
        promptAuth(intent, { returnTo: here });
        dropLink();
        return;
      }
      case "outsider":
        handled.current = true;
        dropLink();
        return;
    }
  }, [
    linked,
    eventId,
    viewer.kind,
    authStatus,
    intent,
    promptAuth,
    openUpload,
    dropLink,
  ]);
}
