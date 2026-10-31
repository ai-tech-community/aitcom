import type { CollectorResponse } from "../collector";
import { CollectorStop } from "../errors";

export function invalidSource(): CollectorStop {
  return new CollectorStop(
    "error",
    "failed",
    "The source returned unreadable data.",
    { code: "source_response_invalid" },
  );
}

/** Decode a public API response without hiding rate limits or invalid JSON. */
export async function sourceJson(
  response: CollectorResponse,
): Promise<unknown> {
  if (
    response.status === 429 ||
    (response.status === 403 &&
      response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    throw new CollectorStop(
      "error",
      "failed",
      "The source's public API rate limit was reached.",
      { code: "source_rate_limited" },
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new CollectorStop(
      "error",
      "failed",
      `The source answered with status ${response.status}.`,
      { code: "source_status", params: { status: response.status } },
    );
  }
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) throw invalidSource();
    throw error;
  }
}

export function sourceText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
