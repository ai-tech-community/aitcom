import { redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

/**
 * The signed-in member for a dashboard layout or page, or a redirect to
 * sign-in. Every page that reads the session calls this itself instead of
 * trusting the layout: layouts do not re-run on tab navigation, so a session
 * that expired between tabs would otherwise reach the page as null.
 * `getSession` is cached per request, so the layout and page share one read.
 */
export async function requireDashboardSession(): Promise<Session> {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");
  return session;
}
