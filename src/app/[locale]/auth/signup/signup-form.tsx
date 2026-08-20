"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SocialOAuthButtons } from "@/components/auth/social-oauth-buttons";
import { authClient } from "@/server/better-auth/client";
import { getPostAuthRedirect } from "@/lib/auth-redirect";
import { toast } from "sonner";

export function SignUpForm({ linkedinEnabled }: { linkedinEnabled: boolean }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const session = authClient.useSession();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
  const [password, setPassword] = useState("");

  const target = getPostAuthRedirect(params);

  useEffect(() => {
    if (session.data?.user) router.replace(target);
  }, [session.data?.user, target, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await authClient.signUp.email({
      name,
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Sign up failed");
      return;
    }
    // When verification is required there is no session yet — stay here
    // instead of sending them to a gated target. If verification is off
    // (no Resend), the session effect below continues to the target.
    toast.success(t("checkEmailToVerify"));
  }

  const signInHref = params.toString()
    ? `/auth/signin?${params.toString()}`
    : "/auth/signin";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("signUp")}
          </h1>
          <p className="text-muted-foreground text-sm">
            Join AIT<span className="text-primary">.</span> Community
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name" className="font-mono text-xs tracking-wider">
              {t("name").toUpperCase()}
            </Label>
            <Input
              id="name"
              type="text"
              placeholder="Jane Doe"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
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
            <Label
              htmlFor="password"
              className="font-mono text-xs tracking-wider"
            >
              {t("password").toUpperCase()}
            </Label>
            <Input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("signingUp") : t("signUp")}
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
          {t("hasAccount")}{" "}
          <Link
            href={signInHref}
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            {t("signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
