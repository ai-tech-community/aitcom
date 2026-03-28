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
      <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome back, {session!.user.name ?? session!.user.email}
      </p>

      <div className="mt-8">
        <DashboardTabs />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 font-mono text-[11px] tracking-wider text-muted-foreground">
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
