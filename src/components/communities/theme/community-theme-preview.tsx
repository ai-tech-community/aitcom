"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { CommunityThemeId } from "@/lib/communities/themes";

/**
 * A look being tried on before it is saved. The Themes settings page sets it;
 * the community frame shows it in place of the saved look. Whoever sets a
 * preview clears it (`setPreviewId(null)`) when they are done, saved or not.
 */
export type CommunityThemePreview = {
  previewId: CommunityThemeId | null;
  setPreviewId: (id: CommunityThemeId | null) => void;
};

const CommunityThemePreviewContext =
  createContext<CommunityThemePreview | null>(null);

export function CommunityThemePreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [previewId, setPreviewId] = useState<CommunityThemeId | null>(null);
  const value = useMemo(() => ({ previewId, setPreviewId }), [previewId]);
  return (
    <CommunityThemePreviewContext.Provider value={value}>
      {children}
    </CommunityThemePreviewContext.Provider>
  );
}

/** For the page that previews looks. Must sit inside the community frame. */
export function useCommunityThemePreview(): CommunityThemePreview {
  const preview = useContext(CommunityThemePreviewContext);
  if (!preview) {
    throw new Error(
      "useCommunityThemePreview must be used inside CommunityThemePreviewProvider",
    );
  }
  return preview;
}

/**
 * The look to show: the preview while there is one, else the saved look.
 * Outside a provider there is nothing to preview, so it is the saved look.
 */
export function useShownCommunityThemeId(
  savedId: CommunityThemeId,
): CommunityThemeId {
  return useContext(CommunityThemePreviewContext)?.previewId ?? savedId;
}
