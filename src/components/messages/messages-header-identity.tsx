"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";

export function MessagesHeaderIdentity({
  fromCommunity,
}: {
  fromCommunity?: string;
}) {
  const inbox = useTranslations("inbox");
  const chat = useTranslations("redesign.chat");
  const { data } = api.communities.getBySlug.useQuery(
    { slug: fromCommunity ?? "" },
    { enabled: Boolean(fromCommunity) },
  );
  const label = !fromCommunity
    ? chat("myCommunities")
    : data?.name
      ? chat("returnToNamedCommunity", { community: data.name })
      : chat("returnToCommunity");

  return (
    <div
      className="flex min-w-0 items-center gap-1 sm:gap-3"
      data-messages-header=""
    >
      <h1 className="shrink-0 text-sm font-semibold sm:text-base">
        {inbox("messagesKicker")}
      </h1>
      <Link
        href={
          fromCommunity
            ? `/communities/${fromCommunity}`
            : "/dashboard/communities"
        }
        className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex min-h-11 min-w-0 items-center gap-1 rounded-md px-1 text-xs leading-tight outline-none focus-visible:ring-2 focus-visible:ring-inset sm:gap-2 sm:px-2 sm:text-sm"
      >
        <ArrowLeft aria-hidden className="size-4 shrink-0" />
        <span dir="auto" className="wrap-anywhere">
          {label}
        </span>
      </Link>
    </div>
  );
}
