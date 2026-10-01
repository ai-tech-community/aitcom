import enData from "emojibase-data/en/data.json";
import enMessages from "emojibase-data/en/messages.json";
import nlData from "emojibase-data/nl/data.json";
import nlMessages from "emojibase-data/nl/messages.json";

/**
 * The emoji picker's data (Emojibase), served from our own origin so that
 * opening the picker sends nothing to an outside CDN. Built once at build
 * time for the app's two languages; the picker asks for
 * `/api/emojibase/<locale>/<file>.json`.
 */
const FILES: Record<string, Record<string, unknown>> = {
  en: { "data.json": enData, "messages.json": enMessages },
  nl: { "data.json": nlData, "messages.json": nlMessages },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.entries(FILES).flatMap(([locale, files]) =>
    Object.keys(files).map((file) => ({ locale, file })),
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string; file: string }> },
) {
  const { locale, file } = await params;
  const body = FILES[locale]?.[file];
  if (!body) return new Response("Not found", { status: 404 });
  return Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
