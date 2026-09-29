import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

import type { auth } from "./config";

export const authClient = createAuthClient({
  // Current host only. An env-minted absolute auth origin can be apex;
  // isolated get-session to that origin is not the Hub document walk, and
  // a client hop would drop `__Secure-better-auth.session_token` on reload.
  // Preview stays relative to the preview host.
  ...(typeof window !== "undefined" ? { baseURL: window.location.origin } : {}),
  fetchOptions: {
    credentials: "include",
  },
  // Session user carries firstName/lastName (config.ts additionalFields).
  plugins: [inferAdditionalFields<typeof auth>()],
});

export type Session = typeof authClient.$Infer.Session;
