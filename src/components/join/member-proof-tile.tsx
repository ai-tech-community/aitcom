"use client";

import { useState } from "react";

import { joinMemberInitials } from "@/lib/join-page-proof";
import { cn } from "@/lib/utils";

/**
 * Photo only after it loads. A missing or failed photo stays an initials
 * tile, so the strip never shows a broken image.
 */
export function MemberProofTile({
  name,
  photoUrl,
}: {
  name: string;
  photoUrl?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(photoUrl) && !failed;

  return (
    <div
      aria-hidden="true"
      className="border-border bg-muted text-foreground relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border font-mono text-xs font-medium tracking-tight uppercase select-none"
    >
      <span className={cn(loaded && "sr-only")}>
        {joinMemberInitials(name)}
      </span>
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- member photos are arbitrary https URLs; hide until load, then drop a failure
        <img
          src={photoUrl}
          alt=""
          className={cn(
            "absolute inset-0 size-full object-cover",
            !loaded && "hidden",
          )}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setFailed(true);
          }}
        />
      ) : null}
    </div>
  );
}
