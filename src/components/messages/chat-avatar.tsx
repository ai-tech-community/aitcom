import { BotIcon, HashIcon, LockIcon, UserIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export function ChatAvatar({
  name,
  image,
  kind = "person",
  size,
  className,
}: {
  name?: string | null;
  image?: string | null;
  kind?: "person" | "agent" | "room" | "private-room";
  size?: "default" | "lg";
  className?: string;
}) {
  const Icon =
    kind === "private-room" ? LockIcon : kind === "room" ? HashIcon : null;
  return (
    <span aria-hidden className="relative inline-flex shrink-0">
      <Avatar size={size} className={className}>
        {image && !Icon ? (
          <AvatarImage src={image} alt="" className="object-cover" />
        ) : null}
        <AvatarFallback
          className={cn("text-foreground font-medium", className)}
        >
          {Icon ? (
            <Icon className="size-4" />
          ) : name ? (
            getInitials(name)
          ) : (
            <UserIcon className="size-4" />
          )}
        </AvatarFallback>
      </Avatar>
      {kind === "agent" ? (
        <span className="bg-background absolute -right-0.5 -bottom-0.5 grid size-4 place-items-center rounded-full">
          <BotIcon className="text-muted-foreground size-3" />
        </span>
      ) : null}
    </span>
  );
}
