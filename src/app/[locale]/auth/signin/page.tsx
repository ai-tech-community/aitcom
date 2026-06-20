"use client";

import { Suspense, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github } from "lucide-react";
import { authClient } from "@/server/better-auth/client";
import { getPostAuthRedirect } from "@/lib/auth-redirect";
import { toast } from "sonner";

function SignInForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const session = authClient.useSession();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    const { error } = await authClient.signIn.email({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message ?? "Sign in failed");
      return;
    }
    router.push(target);
  }

  const signUpHref = params.toString()
    ? `/auth/signup?${params.toString()}`
    : "/auth/signup";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("signIn")}
          </h1>
          <p className="text-muted-foreground text-sm">
            AIT<span className="text-primary">.</span> Community
          </p>
        </div>

        {/* Form */}
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
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("signingIn") : t("signIn")}
          </Button>
        </form>

        {/* Divider */}
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

        {/* OAuth */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() =>
            authClient.signIn.social({
              provider: "github",
              callbackURL: target,
            })
          }
        >
          <Github className="h-4 w-4" />
          {t("github")}
        </Button>

        {/* Footer Link */}
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

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
