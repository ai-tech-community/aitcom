import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-12">
      {children}
    </div>
  );
}
