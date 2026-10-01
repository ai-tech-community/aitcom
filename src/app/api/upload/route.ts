import { type NextRequest, NextResponse } from "next/server";
import { getPayloadClient } from "@/server/payload";
import { auth } from "@/server/better-auth";
import { MAX_IMAGE_BYTES, isMediaPurpose } from "@/lib/image-uploads";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const sentAlt = ((formData.get("alt") as string | null) ?? "").trim();
  // What the image is for. A purpose makes it the uploader's, for one use
  // only (a feed post image); without one it may be shared (a cover).
  const purpose = formData.get("purpose");
  if (purpose !== null && !isMediaPurpose(purpose)) {
    return NextResponse.json({ error: "Unknown purpose" }, { status: 400 });
  }
  // A feed post picture's description is written by its author later;
  // shared uploads (covers, logos) keep a description, as before.
  const alt = sentAlt || (purpose === null ? "upload" : "");

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Only images are allowed" },
      { status: 400 },
    );
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 2MB)" },
      { status: 400 },
    );
  }

  const payload = await getPayloadClient();

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const media = await payload.create({
    collection: "media",
    data: {
      alt,
      uploadedBy: session.user.id,
      ...(purpose === null ? {} : { purpose }),
    },
    file: {
      data: buffer,
      name: file.name,
      mimetype: file.type,
      size: file.size,
    },
  });

  return NextResponse.json({ url: media.url, id: media.id });
}
