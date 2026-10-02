import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";

/**
 * Auth gate for every dashboard route. The page frame (width, gutters) is
 * owned by each route group's layout: the member dashboard runs full width,
 * the agent workspace and onboarding keep the default centred column.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return children;
}
