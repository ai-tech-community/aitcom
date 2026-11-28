import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/avatar";

export function RosterAvatar({
  name,
  image,
}: {
  name: string;
  image: string | null;
}) {
  return (
    <Avatar aria-hidden className="size-11 shrink-0 sm:size-9">
      {image && <AvatarImage src={image} alt="" />}
      <AvatarFallback>{getInitials(name)}</AvatarFallback>
    </Avatar>
  );
}
