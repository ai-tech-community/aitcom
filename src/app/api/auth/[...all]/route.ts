import { type NextRequest, NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/better-auth";
import { checkPasswordResetRateLimit } from "@/server/agent/rate-limit";

const { GET: _GET, POST: _POST } = toNextJsHandler(auth.handler);

export const GET = _GET;

export async function POST(req: NextRequest) {
  // Rate-limit password reset requests by IP
  if (req.nextUrl.pathname === "/api/auth/request-password-reset") {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const limit = checkPasswordResetRateLimit(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many password reset requests. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(limit.retryAfterSecs) },
        },
      );
    }
  }

  return _POST(req);
}
