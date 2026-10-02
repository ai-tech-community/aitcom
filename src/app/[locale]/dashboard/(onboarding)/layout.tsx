/**
 * Onboarding is a focused flow, reached from the "Get started" card: it sits
 * outside the member dashboard frame (no greeting, tabs or side panel), so
 * its own heading is the page's only h1. Default page frame (DESIGN.md).
 */
export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto max-w-6xl px-6 py-8 sm:px-12">{children}</div>;
}
