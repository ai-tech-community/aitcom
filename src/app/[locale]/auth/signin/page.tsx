import { Suspense } from "react";

import { enabledOAuthProviders } from "@/lib/oauth-providers";

import { SignInForm } from "./signin-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const oauthProviders = enabledOAuthProviders();

  return (
    <Suspense fallback={null}>
      <SignInForm oauthProviders={oauthProviders} />
    </Suspense>
  );
}
