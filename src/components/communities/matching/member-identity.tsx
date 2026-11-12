import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";

export type MatchIdentity = {
  userId: string;
  displayName: string | null;
  image: string | null;
};

export function MemberIdentity({
  member,
  fallback,
}: {
  member: MatchIdentity;
  fallback: string;
}) {
  const name = member.displayName ?? fallback;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-9 shrink-0">
        {member.image && <AvatarImage src={member.image} alt="" />}
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 text-sm font-medium break-words">{name}</span>
    </div>
  );
}
