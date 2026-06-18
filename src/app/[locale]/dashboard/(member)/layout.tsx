import { getSession } from "@/server/better-auth/server";
import { DashboardTabs } from "@/components/dashboard-tabs";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function MemberDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, t] = await Promise.all([
    getSession(),
    getTranslations("dashboard"),
  ]);

  return (
    <>
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-muted-foreground mt-2">
        Welcome back, {session!.user.name ?? session!.user.email}
      </p>

      <div className="mt-8">
        <DashboardTabs />
      </div>

      <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-3 font-mono text-xs tracking-wider">
        <span>{t("quickLinks")}:</span>
        <Link href="/dashboard/onboarding" className="hover:text-foreground">
          {t("onboarding")}
        </Link>
        <Link href="/dashboard/notifications" className="hover:text-foreground">
          {t("notifications")}
        </Link>
      </div>

      <div className="mt-8">{children}</div>
    </>
  );
}
