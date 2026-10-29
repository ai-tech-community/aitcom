import { renderToString } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import fr from "../../messages/fr.json";
import { EventsListingToolbar } from "./events-listing-toolbar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/fr/events",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("EventsListingToolbar", () => {
  it("server-renders French filter labels", () => {
    const html = renderToString(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <EventsListingToolbar
          upcomingHref="/fr/events"
          pastHref="/fr/events?past=1"
          gridHref="/fr/events"
          mapHref="/fr/events?view=map"
          isPast={false}
          isMapView={false}
          visitorCountryCode="US"
          visitorCountryName="United States"
        />
      </NextIntlClientProvider>,
    );

    expect(html).toContain("À VENIR");
    expect(html).toContain("PASSÉS");
    expect(html).toContain("DÉTECTÉ · ÉTATS-UNIS (US)");
    expect(html).toContain("AFFICHER UNIQUEMENT ÉTATS-UNIS");
    expect(html).toContain("Tout type");
    expect(html).toContain("Toute thématique");
    expect(html).toContain("Tout format");
    expect(html).toContain("Toute pertinence AIT");
    expect(html).toContain("Tri : date");
    expect(html).toContain("UTILISER MA POSITION");
    expect(html).toContain("GRILLE");
    expect(html).toContain("CARTE");
    expect(html).not.toContain("UPCOMING");
    expect(html).not.toContain("USE MY LOCATION");
  });
});
