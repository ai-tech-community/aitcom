/** Keep a locale-free community return destination across inbox deep links. */
export function messageCommunitySlug(value: string | string[] | undefined) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    ? value
    : undefined;
}

export function isMessagesPath(pathname: string) {
  return pathname === "/messages" || pathname.startsWith("/messages/");
}

export function messagesHref(
  conversationId?: string,
  fromCommunity?: string,
  unreadOnly = false,
) {
  const pathname = conversationId ? `/messages/${conversationId}` : "/messages";
  const query = new URLSearchParams();
  if (fromCommunity) query.set("fromCommunity", fromCommunity);
  if (unreadOnly) query.set("view", "unread");
  return query.size ? `${pathname}?${query.toString()}` : pathname;
}
