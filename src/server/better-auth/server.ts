import { cookies, headers } from "next/headers";
import { cache } from "react";

import { auth } from ".";
import { headersForDocumentAuth } from "./document-auth-headers";

export const getSession = cache(async () => {
  const incoming = await headers();
  const store = await cookies();
  return auth.api.getSession({
    headers: headersForDocumentAuth(incoming, store.getAll()),
  });
});
