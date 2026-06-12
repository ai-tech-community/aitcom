import { Link } from "@/i18n/navigation";

export type MemberFace = { userId: string; displayName: string };

/**
 * Team member list as profile-linked "face" chips (initials + name) plus an
 * anonymous "+N" for private profiles. Shared by the winners page and the
 * project gallery; works in both server and client trees.
 */
export function MemberFaces({
  faces,
  privateCount,
}: {
  faces: MemberFace[];
  privateCount: number;
}) {
  if (faces.length === 0 && privateCount === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {faces.map((face) => (
        <Link
          key={face.userId}
          href={`/members/${face.userId}`}
          className="border-border hover:bg-secondary/40 flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors"
        >
          <span className="bg-secondary text-muted-foreground flex h-5 w-5 items-center justify-center rounded-full font-mono text-[9px]">
            {face.displayName
              .split(" ")
              .map((p) => p[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)}
          </span>
          {face.displayName}
        </Link>
      ))}
      {privateCount > 0 ? (
        <span className="text-muted-foreground flex items-center px-2 font-mono text-xs">
          +{privateCount}
        </span>
      ) : null}
    </div>
  );
}
