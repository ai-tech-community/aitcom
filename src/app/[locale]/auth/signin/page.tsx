"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github } from "lucide-react";

export default function SignInPage() {
  const t = useTranslations("auth");
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // TODO: integrate with better-auth
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("signIn")}
          </h1>
          <p className="text-sm text-muted-foreground">
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
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="font-mono text-xs tracking-wider">
                {t("password").toUpperCase()}
              </Label>
              <Link
                href="/auth/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t("forgotPassword")}
              </Link>
            </div>
            <Input id="password" type="password" required />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("signingIn") : t("signIn")}
          </Button>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 font-mono text-muted-foreground">
              {t("orContinueWith").toUpperCase()}
            </span>
          </div>
        </div>

        {/* OAuth */}
        <Button variant="outline" className="w-full gap-2">
          <Github className="h-4 w-4" />
          {t("github")}
        </Button>

        {/* Footer Link */}
        <p className="text-center text-sm text-muted-foreground">
          {t("noAccount")}{" "}
          <Link
            href="/auth/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("signUp")}
          </Link>
        </p>
      </div>
    </div>
  );
}
