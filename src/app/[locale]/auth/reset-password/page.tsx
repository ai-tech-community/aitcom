"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/server/better-auth/client";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const error = searchParams.get("error");
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  if (error || !token) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("resetPasswordTitle")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("invalidResetToken")}
          </p>
          <Link
            href="/auth/forgot-password"
            className="text-foreground block text-sm font-medium underline-offset-4 hover:underline"
          >
            {t("forgotPasswordTitle")}
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword,
      token: token!,
    });
    setLoading(false);
    if (resetError) {
      toast.error(resetError.message ?? "Something went wrong");
      return;
    }
    toast.success(t("passwordResetSuccess"));
    router.push("/auth/signin");
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">
            {t("resetPasswordTitle")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="newPassword"
              className="font-mono text-xs tracking-wider"
            >
              {t("newPassword").toUpperCase()}
            </Label>
            <Input
              id="newPassword"
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("resettingPassword") : t("resetPassword")}
          </Button>
        </form>
      </div>
    </div>
  );
}
