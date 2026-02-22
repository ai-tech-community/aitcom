import { getLocale } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { EventRegisterButton } from "@/components/event-register-button";

const typeLabels: Record<string, string> = {
  workshop: "WORKSHOP",
  hackathon: "HACKATHON",
  deep_dive: "DEEP-DIVE",
  meetup: "MEETUP",
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: { slug: { equals: slug } },
    depth: 2,
    locale: locale as "en" | "nl",
    limit: 1,
  });

  const event = docs[0];
  if (!event) notFound();

  const speakers = (event.speakers ?? []) as Array<{
    id: number;
    name: string;
    company?: string;
    bio?: string;
  }>;

  return (
    <div className="mx-auto max-w-3xl px-6 py-16 sm:px-12">
      {/* Meta line */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-3 font-mono text-xs tracking-wider">
        <span>{formatDate(event.date)}</span>
        {event.startTime && (
          <>
            <span className="text-border">|</span>
            <span>
              {event.startTime}
              {event.endTime ? ` – ${event.endTime}` : ""}
            </span>
          </>
        )}
        <span className="text-border">|</span>
        <span>{event.location}</span>
      </div>

      {/* Title */}
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight">
        {event.title}
      </h1>

      {/* Type badge + attendees */}
      <div className="mt-4 flex items-center gap-3">
        <span className="border-border text-muted-foreground rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider">
          {typeLabels[event.type] ?? event.type}
        </span>
        {event.maxAttendees != null && (
          <span className="text-muted-foreground font-mono text-[11px] tracking-wider">
            Max {event.maxAttendees} attendees
          </span>
        )}
      </div>

      {/* Description */}
      {event.description && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / ABOUT
            </span>
          </div>
          <div className="prose prose-neutral text-muted-foreground mt-4 max-w-none">
            {/* Rich text from Payload — render as serialized text for now */}
            {typeof event.description === "string" ? (
              <p>{event.description}</p>
            ) : (
              <p className="text-muted-foreground text-sm leading-relaxed">
                {extractTextFromRichText(event.description)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Speakers */}
      {speakers.length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / SPEAKERS
            </span>
          </div>
          <div className="mt-4 space-y-4">
            {speakers.map((speaker) => (
              <div
                key={speaker.id}
                className="border-border flex items-center gap-3 rounded border border-dashed px-4 py-3"
              >
                <div className="bg-primary h-2 w-2 rounded-full" />
                <div>
                  <span className="font-medium">{speaker.name}</span>
                  {speaker.company && (
                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                      @ {speaker.company}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Registration */}
      <div className="border-border mt-8 border-t pt-8">
        <div className="border-border border-b pb-4">
          <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / REGISTRATION
          </span>
        </div>
        <div className="mt-4">
          <EventRegisterButton
            eventId={Number(event.id)}
            maxAttendees={(event.maxAttendees as number | undefined) ?? null}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Extract plain text from Payload's Lexical rich text JSON structure.
 */
function extractTextFromRichText(richText: unknown): string {
  if (!richText || typeof richText !== "object") return "";

  const root = richText as { root?: { children?: unknown[] } };
  if (!root.root?.children) return "";

  function extractChildren(children: unknown[]): string {
    return children
      .map((child) => {
        const node = child as { text?: string; children?: unknown[] };
        if (typeof node.text === "string") return node.text;
        if (Array.isArray(node.children)) return extractChildren(node.children);
        return "";
      })
      .join("");
  }

  return extractChildren(root.root.children);
}
