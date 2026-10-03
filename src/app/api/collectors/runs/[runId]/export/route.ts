import { NextResponse } from "next/server";

import { getSession } from "@/server/better-auth/server";
import {
  EXPORT_FORMATS,
  type ExportFormatId,
} from "@/server/collectors/export/formats";
import { collectorsEnabled } from "@/server/collectors/flags";
import { liveCollectorRuns } from "@/server/collectors/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One of the registered export formats, so a new format needs no change here. */
function isFormat(value: string | null): value is ExportFormatId {
  return value !== null && Object.hasOwn(EXPORT_FORMATS, value);
}

/** An async iterable of text chunks as a byte stream, read lazily. */
function toStream(body: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = body[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/**
 * Download a run's dataset (spec: "Export"). Owner only: another member's run
 * answers 404, never 403. Streams page by page, so a 5,000-row run is never
 * held in memory whole.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!collectorsEnabled())
    return new NextResponse("Not found", { status: 404 });
  const session = await getSession();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const format = new URL(request.url).searchParams.get("format");
  if (!isFormat(format))
    return new NextResponse("Unknown format", { status: 400 });

  const { runId } = await params;
  const file = await liveCollectorRuns().exportRun(
    session.user.id,
    runId,
    format,
  );
  if (!file) return new NextResponse("Not found", { status: 404 });

  // The facade builds the filename from the collector id (kebab-case) and
  // the run id's first 8 hex characters, so it never contains a quote.
  return new NextResponse(toStream(file.body), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
