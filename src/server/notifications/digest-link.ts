import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";

const AIT_HOSTS = new Set(["www.aitcommunity.org", "aitcommunity.org"]);

/** UTC Monday of the week that contains `sendDate`, as `YYYY-MM-DD`. */
export function digestSendDate(sendDate: Date): string {
  const monday = new Date(
    Date.UTC(
      sendDate.getUTCFullYear(),
      sendDate.getUTCMonth(),
      sendDate.getUTCDate(),
    ),
  );
  const day = monday.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  monday.setUTCDate(monday.getUTCDate() + offset);
  const year = monday.getUTCFullYear();
  const month = String(monday.getUTCMonth() + 1).padStart(2, "0");
  const date = String(monday.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

export function digestCampaign(sendDate: Date): string {
  return `weekly-${digestSendDate(sendDate)}`;
}

/**
 * Canonical AIT page URL for the weekly digest, with this week's campaign.
 * Anything that is not an AIT http(s) page — outside articles, mailto — is
 * returned unchanged and untagged.
 */
export function digestLink(path: string, sendDate: Date): string {
  if (!path.startsWith("/") && !/^https?:\/\//i.test(path)) {
    return path;
  }

  let url: URL;
  try {
    url = path.startsWith("/")
      ? new URL(path, CANONICAL_PRODUCTION_ORIGIN)
      : new URL(path);
  } catch {
    return path;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return path;
  if (!AIT_HOSTS.has(url.hostname)) return path;

  url.protocol = "https:";
  url.hostname = "www.aitcommunity.org";
  url.port = "";
  url.searchParams.set("utm_source", "digest");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", digestCampaign(sendDate));
  return url.toString();
}
