import { Suspense } from "react";

import { isLinkedinOAuthEnabled } from "@/lib/linkedin-oauth-env";

import { SignUpForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  const linkedinEnabled = isLinkedinOAuthEnabled();

  return (
    <Suspense fallback={null}>
      <SignUpForm linkedinEnabled={linkedinEnabled} />
    </Suspense>
  );
}
