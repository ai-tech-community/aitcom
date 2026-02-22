import { getLocale } from "next-intl/server";
import { getPayload } from "payload";
import config from "@payload-config";
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

  const payload = await getPayload({ config });
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
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs tracking-wider text-muted-foreground">
        <span>{formatDate(event.date as string)}</span>
        {event.startTime && (
          <>
            <span className="text-border">|</span>
            <span>
              {event.startTime as string}
              {event.endTime ? ` – ${event.endTime as string}` : ""}
            </span>
          </>
        )}
        <span className="text-border">|</span>
        <span>{event.location as string}</span>
      </div>

      {/* Title */}
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight">
        {event.title as string}
      </h1>

      {/* Type badge + attendees */}
      <div className="mt-4 flex items-center gap-3">
        <span className="rounded border border-border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
          {typeLabels[event.type as string] ?? (event.type as string)}
        </span>
        {event.maxAttendees != null && (
          <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
            Max {event.maxAttendees as number} attendees
          </span>
        )}
      </div>

      {/* Description */}
      {event.description && (
        <div className="mt-8 border-t border-border pt-8">
          <div className="border-b border-border pb-4">
            <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
              / ABOUT
            </span>
          </div>
          <div className="prose prose-neutral mt-4 max-w-none text-muted-foreground">
            {/* Rich text from Payload — render as serialized text for now */}
            {typeof event.description === "string" ? (
              <p>{event.description}</p>
            ) : (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {extractTextFromRichText(event.description)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Speakers */}
      {speakers.length > 0 && (
        <div className="mt-8 border-t border-border pt-8">
          <div className="border-b border-border pb-4">
            <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
              / SPEAKERS
            </span>
          </div>
          <div className="mt-4 space-y-4">
            {speakers.map((speaker) => (
              <div
                key={speaker.id}
                className="flex items-center gap-3 rounded border border-dashed border-border px-4 py-3"
              >
                <div className="h-2 w-2 rounded-full bg-primary" />
                <div>
                  <span className="font-medium">{speaker.name}</span>
                  {speaker.company && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
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
      <div className="mt-8 border-t border-border pt-8">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / REGISTRATION
          </span>
        </div>
        <div className="mt-4">
          <EventRegisterButton
            eventId={event.id}
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
