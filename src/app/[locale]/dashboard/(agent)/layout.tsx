import { Link } from "@/i18n/navigation";
import { ArrowLeftIcon } from "lucide-react";

export default function AgentDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 font-mono text-xs tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeftIcon className="h-3 w-3" />
        DASHBOARD
      </Link>
      <div className="mt-6">{children}</div>
    </>
  );
}
