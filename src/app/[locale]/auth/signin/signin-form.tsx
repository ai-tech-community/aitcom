"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { MailIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SocialOAuthButtons } from "@/components/auth/social-oauth-buttons";
import { authClient } from "@/server/better-auth/client";
import { getPostAuthRedirect } from "@/lib/auth-redirect";
import { isEmailNotVerifiedError } from "@/lib/auth-errors";
import { toast } from "sonner";

export function SignInForm({ linkedinEnabled }: { linkedinEnabled: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const session = authClient.useSession();
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);

  // Target is a full, locale-prefixed path — push with the plain router so the
  // locale isn't prefixed twice. See lib/auth-redirect.
  const target = getPostAuthRedirect(params);

  // Already signed in (e.g. landed here via a stale link) → skip the form.
  useEffect(() => {
    if (session.data?.user) router.replace(target);
  }, [session.data?.user, target, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setNeedsVerification(false);
    const { error } = await authClient.signIn.email({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      if (isEmailNotVerifiedError(error)) {
        setNeedsVerification(true);
        return;
      }
      toast.error(error.message ?? "Sign in failed");
      return;
    }
    router.push(target);
  }

  async function handleResendVerification() {
    if (!email) return;
    setResending(true);
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: target,
    });
    setResending(false);
    if (error) {
      toast.error(error.message ?? t("verificationEmailFailed"));
      return;
    }
    toast.success(t("verificationEmailSent"));
  }

  const signUpHref = params.toString()
    ? `/auth/signup?${params.toString()}`
    : "/auth/signup";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("signIn")}
          </h1>
          <p className="text-muted-foreground text-sm">
            AIT<span className="text-primary">.</span> Community
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="font-mono text-xs tracking-wider">
              {t("email").toUpperCase()}
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="engineer@company.nl"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="password"
                className="font-mono text-xs tracking-wider"
              >
                {t("password").toUpperCase()}
              </Label>
              <Link
                href="/auth/forgot-password"
                className="text-muted-foreground text-xs underline-offset-4 hover:underline"
              >
                {t("forgotPassword")}
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {needsVerification ? (
            <div
              role="alert"
              className="border-border bg-card space-y-3 rounded-lg border px-4 py-3"
            >
              <div className="flex items-start gap-3">
                <MailIcon
                  className="text-warning mt-0.5 size-4 shrink-0"
                  aria-hidden="true"
                />
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("emailNotVerified")}</p>
                  <p className="text-muted-foreground text-sm">
                    {t("emailNotVerifiedDescription")}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={resending || !email}
                onClick={handleResendVerification}
              >
                {resending
                  ? t("resendingVerification")
                  : t("resendVerification")}
              </Button>
            </div>
          ) : null}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("signingIn") : t("signIn")}
          </Button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="border-border w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background text-muted-foreground px-2 font-mono">
              {t("orContinueWith").toUpperCase()}
            </span>
          </div>
        </div>

        <SocialOAuthButtons
          callbackURL={target}
          linkedinEnabled={linkedinEnabled}
        />

        <p className="text-muted-foreground text-center text-sm">
          {t("noAccount")}{" "}
          <Link
            href={signUpHref}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {t("signUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
