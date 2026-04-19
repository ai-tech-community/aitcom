import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardSettingsPage() {
  return (
    <div>
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / SETTINGS
        </span>
      </div>
      <p className="text-muted-foreground mt-6 text-sm">
        Settings coming soon.
      </p>
    </div>
  );
}
