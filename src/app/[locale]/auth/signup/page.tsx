import { Suspense } from "react";

import { enabledOAuthProviders } from "@/lib/oauth-providers";

import { SignUpForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  const oauthProviders = enabledOAuthProviders();

  return (
    <Suspense fallback={null}>
      <SignUpForm oauthProviders={oauthProviders} />
    </Suspense>
  );
}
