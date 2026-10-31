import { describe, expect, it } from "vitest";
import { extractEvents } from "./extract-events";
const spec = {
  kind: "events" as const,
  baseUrl: "https://events.example/list",
};
const html = (data: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
describe("structured Event extraction", () => {
  it("reads nested graphs and ItemList entries and resolves local venue and organizer references", () => {
    const result = extractEvents(
      html({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@id": "#venue",
            "@type": "Place",
            name: "Town hall",
            address: { addressLocality: "Amsterdam" },
          },
          { "@id": "#owner", "@type": "Organization", name: "AIT" },
          {
            "@type": "ItemList",
            itemListElement: [
              {
                "@type": "ListItem",
                item: {
                  "@type": ["Thing", "Event"],
                  name: "Community day",
                  url: "/day",
                  startDate: "2026-11-20T18:00:00+01:00",
                  endDate: "2026-11-20T20:00:00+01:00",
                  location: { "@id": "#venue" },
                  organizer: { "@id": "#owner" },
                  eventAttendanceMode:
                    "https://schema.org/MixedEventAttendanceMode",
                },
              },
            ],
          },
        ],
      }),
      spec,
    );
    expect(result.rows).toEqual([
      {
        name: "Community day",
        url: "https://events.example/day",
        startDate: "2026-11-20T18:00:00+01:00",
        endDate: "2026-11-20T20:00:00+01:00",
        venue: "Town hall",
        city: "Amsterdam",
        online: "true",
        organizer: "AIT",
      },
    ]);
  });
  it("supports top-level arrays, virtual locations, absent dates and safe URL fallbacks", () => {
    const event = {
      "@type": "https://schema.org/Event",
      name: "Online meetup",
      location: { "@type": "VirtualLocation" },
      url: "javascript:alert(1)",
    };
    const result = extractEvents(html([event, event]), spec);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      online: "true",
      url: spec.baseUrl,
      startDate: null,
      venue: null,
    });
  });
  it("reports malformed scripts and invalid entries while preserving good events", () => {
    const result = extractEvents(
      '<script type="application/ld+json">bad json</script>' +
        html([{ "@type": "Event" }, { "@type": "Event", name: "Valid" }]),
      spec,
    );
    expect(result.eventIssues).toEqual({
      malformedScripts: 1,
      invalidEvents: 1,
    });
    expect(result.rows[0]?.name).toBe("Valid");
  });
  it("ignores ordinary scripts, inert templates and non-events without interpreting their contents", () => {
    expect(
      extractEvents(
        "<script>throw 1</script><template>" +
          html({ "@type": "Event", name: "Inert" }) +
          "</template>" +
          html({ "@type": "Organization", name: "No event" }),
        spec,
      ).rows,
    ).toEqual([]);
  });
  it("bounds deeply nested JSON data and HTML", () => {
    let value: unknown = {};
    for (let i = 0; i < 70; i++) value = { child: value };
    expect(() => extractEvents(html(value), spec)).toThrowError(
      expect.objectContaining({ code: "page_too_deep" }),
    );
    expect(() =>
      extractEvents("<div>".repeat(520) + "x" + "</div>".repeat(520), spec),
    ).toThrowError(expect.objectContaining({ code: "page_too_deep" }));
  });
  it("caps output and reports a partial result", () => {
    const result = extractEvents(
      html(
        Array.from({ length: 5001 }, (_, i) => ({
          "@type": "Event",
          name: `Event ${i}`,
        })),
      ),
      spec,
    );
    expect(result.rows).toHaveLength(5000);
    expect(result.truncated).toBe(true);
  });
});
