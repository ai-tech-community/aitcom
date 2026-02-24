import { auth } from ".";
import { headers } from "next/headers";
import { cache } from "react";

export const getSession = cache(async () => {
  const h = await headers();
  console.log("[getSession] cookie header:", h.get("cookie")?.substring(0, 200));
  const session = await auth.api.getSession({ headers: h });
  console.log("[getSession] result:", session ? `user=${session.user?.email}` : "null");
  return session;
});
