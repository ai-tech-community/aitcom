"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Github } from "lucide-react";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";

export default function SignUpPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    toast.success("Account created!");
    router.push("/");
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Header */}
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("signUp")}
          </h1>
          <p className="text-sm text-muted-foreground">
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
            <Label htmlFor="password" className="font-mono text-xs tracking-wider">
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
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-background px-2 font-mono text-muted-foreground">
              {t("orContinueWith").toUpperCase()}
            </span>
          </div>
        </div>

        {/* OAuth */}
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => authClient.signIn.social({ provider: "github" })}
        >
          <Github className="h-4 w-4" />
          {t("github")}
        </Button>

        {/* Footer Link */}
        <p className="text-center text-sm text-muted-foreground">
          {t("hasAccount")}{" "}
          <Link
            href="/auth/signin"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("signIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
