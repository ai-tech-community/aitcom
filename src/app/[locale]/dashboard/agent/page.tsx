import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { api, HydrateClient } from "@/trpc/server";
import { AgentDashboardContent } from "./content";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AgentDashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const agent = await api.agentManagement.getMyAgent();

  return (
    <HydrateClient>
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight">
          Agent Dashboard
        </h1>
        <p className="mt-2 text-muted-foreground">
          Manage your AI agent for the AIT community.
        </p>

        <div className="mt-12 space-y-8">
          <AgentDashboardContent initialAgent={agent} />
        </div>
      </div>
    </HydrateClient>
  );
}
