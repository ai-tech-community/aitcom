"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo: "/auth/reset-password" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? "Request failed");
      }
    } catch (err) {
      setLoading(false);
      toast.error(err instanceof Error ? err.message : "Something went wrong");
      return;
    }
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("forgotPasswordTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("forgotPasswordDescription")}
          </p>
        </div>

        {sent ? (
          <div className="space-y-4">
            <p className="text-muted-foreground text-center text-sm">
              {t("resetLinkSent")}
            </p>
            <Link
              href="/auth/signin"
              className="text-foreground block text-center text-sm font-medium underline-offset-4 hover:underline"
            >
              {t("backToSignIn")}
            </Link>
          </div>
        ) : (
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("sendingResetLink") : t("sendResetLink")}
            </Button>
            <p className="text-muted-foreground text-center text-sm">
              <Link
                href="/auth/signin"
                className="text-foreground font-medium underline-offset-4 hover:underline"
              >
                {t("backToSignIn")}
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
