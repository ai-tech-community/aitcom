import { describe, it, expect } from "vitest";
import { parseEventFromHtml } from "./event-link-import";

const SOURCE = "https://lu.ma/ai-builders";

describe("parseEventFromHtml", () => {
  it("extracts an event from schema.org JSON-LD", () => {
    const html = `
      <html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Event",
        "name": "AI Builders Meetup",
        "description": "An evening of agents and demos.",
        "startDate": "2026-06-12T18:00:00+02:00",
        "endDate": "2026-06-12T21:00:00+02:00",
        "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
        "image": "https://cdn.example.com/cover.jpg",
        "location": {
          "@type": "Place",
          "name": "TQ Amsterdam",
          "address": {
            "@type": "PostalAddress",
            "addressLocality": "Amsterdam",
            "addressCountry": "NL"
          }
        }
      }
      </script>
      </head><body></body></html>`;

    const r = parseEventFromHtml(html, SOURCE);
    expect(r.title).toBe("AI Builders Meetup");
    expect(r.description).toBe("An evening of agents and demos.");
    expect(r.date).toBe("2026-06-12");
    expect(r.startTime).toBe("18:00");
    expect(r.endTime).toBe("21:00");
    expect(r.location).toBe("TQ Amsterdam");
    expect(r.city).toBe("Amsterdam");
    expect(r.country).toBe("NL");
    expect(r.format).toBe("in-person");
    expect(r.coverImageUrl).toBe("https://cdn.example.com/cover.jpg");
    expect(r.sourceUrl).toBe(SOURCE);
  });

  it("finds an Event inside a JSON-LD @graph array", () => {
    const html = `
      <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebSite","name":"X"},
        {"@type":"Event","name":"Graph Event","startDate":"2026-07-01T09:30"}
      ]}
      </script>`;
    const r = parseEventFromHtml(html, SOURCE);
    expect(r.title).toBe("Graph Event");
    expect(r.date).toBe("2026-07-01");
    expect(r.startTime).toBe("09:30");
  });

  it("maps online attendance mode to format online", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"Event","name":"Webinar",
       "eventAttendanceMode":"https://schema.org/OnlineEventAttendanceMode"}
      </script>`;
    expect(parseEventFromHtml(html, SOURCE).format).toBe("online");
  });

  it("falls back to OpenGraph tags when JSON-LD is absent", () => {
    const html = `
      <html><head>
        <meta property="og:title" content="OG Only Event" />
        <meta property="og:description" content="From OpenGraph." />
        <meta property="og:image" content="https://cdn.example.com/og.png" />
      </head></html>`;
    const r = parseEventFromHtml(html, SOURCE);
    expect(r.title).toBe("OG Only Event");
    expect(r.description).toBe("From OpenGraph.");
    expect(r.coverImageUrl).toBe("https://cdn.example.com/og.png");
    expect(r.date).toBeUndefined();
  });

  it("returns only sourceUrl when nothing is parseable", () => {
    const r = parseEventFromHtml("<html><body>nope</body></html>", SOURCE);
    expect(r.sourceUrl).toBe(SOURCE);
    expect(r.title).toBeUndefined();
  });

  it("ignores malformed JSON-LD blocks without throwing", () => {
    const html = `
      <script type="application/ld+json">{ not valid json </script>
      <meta property="og:title" content="Recovered" />`;
    expect(parseEventFromHtml(html, SOURCE).title).toBe("Recovered");
  });

  it("resolves a relative og:image against the source URL", () => {
    const html = `<meta property="og:image" content="/img/cover.jpg" />`;
    const r = parseEventFromHtml(html, "https://lu.ma/ai-builders");
    expect(r.coverImageUrl).toBe("https://lu.ma/img/cover.jpg");
  });

  it("does not select a non-Event node whose @type merely contains 'Event'", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"PublicationEvent","name":"Press Release","startDate":"2026-01-01T10:00"}
      </script>
      <script type="application/ld+json">
      {"@type":"Event","name":"Real Meetup","startDate":"2026-06-12T18:00"}
      </script>`;
    const r = parseEventFromHtml(html, SOURCE);
    expect(r.title).toBe("Real Meetup");
    expect(r.date).toBe("2026-06-12");
  });

  it("matches a recognized event subtype (BusinessEvent)", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"BusinessEvent","name":"Conf 2026","startDate":"2026-09-01T09:00"}
      </script>`;
    expect(parseEventFromHtml(html, SOURCE).title).toBe("Conf 2026");
  });

  it("handles @type as an array containing Event", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":["Thing","Event"],"name":"Multi-Type","startDate":"2026-06-01T09:00"}
      </script>`;
    const r = parseEventFromHtml(html, SOURCE);
    expect(r.title).toBe("Multi-Type");
    expect(r.date).toBe("2026-06-01");
  });

  it("extracts location from an array (hybrid event: VirtualLocation + Place)", () => {
    const html = `
      <script type="application/ld+json">
      {"@type":"Event","name":"Hybrid","startDate":"2026-06-12T18:00",
       "location":[
         {"@type":"VirtualLocation","url":"https://zoom.us/x"},
         {"@type":"Place","name":"TQ Amsterdam","address":{"addressLocality":"Amsterdam","addressCountry":"NL"}}
       ]}
      </script>`;
    const r = parseEventFromHtml(html, SOURCE);
    expect(r.location).toBe("TQ Amsterdam");
    expect(r.city).toBe("Amsterdam");
    expect(r.country).toBe("NL");
  });
});
