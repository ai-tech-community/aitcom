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

function SignUpForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const params = useSearchParams();
  const session = authClient.useSession();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState(params.get("email") ?? "");
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
    toast.success(t("accountCreated"));
    router.push(target);
  }

  const signInHref = params.toString()
    ? `/auth/signin?${params.toString()}`
    : "/auth/signin";

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("signUp")}
          </h1>
          <p className="text-muted-foreground text-sm">
            Join AIT<span className="text-primary">.</span> Community
          </p>
        </div>

        {/* Form */}
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

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpForm />
    </Suspense>
  );
}
