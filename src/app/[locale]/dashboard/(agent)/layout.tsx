import { Link } from "@/i18n/navigation";
import { ArrowLeftIcon } from "lucide-react";

export default function AgentDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The default page frame (DESIGN.md "Page frame"); only the member
  // dashboard runs full width.
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 sm:px-12">
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 font-mono text-xs tracking-wider transition-colors"
      >
        <ArrowLeftIcon className="h-3 w-3" />
        DASHBOARD
      </Link>
      <div className="mt-6">{children}</div>
    </div>
  );
}
