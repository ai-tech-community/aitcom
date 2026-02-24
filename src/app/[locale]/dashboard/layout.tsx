import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { DashboardTabs } from "@/components/dashboard-tabs";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome back, {session.user.name ?? session.user.email}
      </p>

      <div className="mt-8">
        <DashboardTabs />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
