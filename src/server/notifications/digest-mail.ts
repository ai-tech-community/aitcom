import type { HubDigest } from "./digest";
import { renderHubDigestHtml, renderHubDigestText } from "./render";
import {
  digestListUnsubscribeHeaders,
  signUnsubscribeToken,
  type DigestUnsubscribePayload,
} from "./unsubscribe-token";

export type DigestDelivery = {
  html: string;
  text: string;
  headers?: Record<string, string>;
};

/** The exact html, text, and list-unsubscribe headers a send would use. */
export function renderDigestDelivery(
  digest: HubDigest,
  userId: string,
  sendDate: Date,
  secret: string | null,
): DigestDelivery {
  const payload: DigestUnsubscribePayload = { userId, scope: "digest" };
  const unsubscribeToken = secret
    ? signUnsubscribeToken(payload, secret)
    : undefined;
  return {
    html: renderHubDigestHtml(digest, sendDate, { unsubscribeToken }),
    text: renderHubDigestText(digest, sendDate, { unsubscribeToken }),
    headers: unsubscribeToken
      ? digestListUnsubscribeHeaders(unsubscribeToken)
      : undefined,
  };
}
