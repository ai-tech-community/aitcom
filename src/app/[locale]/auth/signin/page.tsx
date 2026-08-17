import { Suspense } from "react";

import { isLinkedinOAuthEnabled } from "@/lib/linkedin-oauth-env";

import { SignInForm } from "./signin-form";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const linkedinEnabled = isLinkedinOAuthEnabled();

  return (
    <Suspense fallback={null}>
      <SignInForm linkedinEnabled={linkedinEnabled} />
    </Suspense>
  );
}
