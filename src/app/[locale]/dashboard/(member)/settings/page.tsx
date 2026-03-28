import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function DashboardSettingsPage() {
  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / SETTINGS
        </span>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Settings coming soon.
      </p>
    </div>
  );
}
