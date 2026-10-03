import { NextResponse } from "next/server";

import { getSession } from "@/server/better-auth/server";
import {
  EXPORT_FORMATS,
  type ExportFormatId,
} from "@/server/collectors/export/formats";
import { collectorsEnabled } from "@/server/collectors/flags";
import { isRunActive } from "@/lib/collectors/run-presentation";
import { liveCollectorRuns } from "@/server/collectors/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One of the registered export formats, so a new format needs no change here. */
function isFormat(value: string | null): value is ExportFormatId {
  return value !== null && Object.hasOwn(EXPORT_FORMATS, value);
}

/**
 * An async iterable of text chunks as a byte stream, read lazily. A failure
 * mid-download is logged with the run id and errors the stream, so the
 * browser sees a broken download instead of a silently short file.
 */
function toStream(
  body: AsyncIterable<string>,
  runId: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = body[Symbol.asyncIterator]();
  // A cancel can land while a read is in flight; its chunk is then dropped.
  let cancelled = false;
  return new ReadableStream({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (cancelled) return;
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (err) {
        if (cancelled) return;
        console.error(`[collectors] export of run ${runId} failed`, err);
        controller.error(err);
      }
    },
    async cancel() {
      cancelled = true;
      await iterator.return?.();
    },
  });
}

/**
 * Download a run's dataset (spec: "Export"). Owner only: another member's run
 * answers 404, never 403. A run still queued or running answers 409: its file
 * would be incomplete. Streams page by page, so a 5,000-row run is never
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
  const runs = liveCollectorRuns();
  const run = await runs.getRun(session.user.id, runId);
  if (!run) return new NextResponse("Not found", { status: 404 });
  if (isRunActive(run.status)) {
    return new NextResponse("Run still in progress", { status: 409 });
  }

  const file = await runs.exportRun(session.user.id, runId, format);
  if (!file) return new NextResponse("Not found", { status: 404 });

  // The facade builds the filename from the collector id (kebab-case) and
  // the run id's first 8 hex characters, so it never contains a quote.
  return new NextResponse(toStream(file.body, runId), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
