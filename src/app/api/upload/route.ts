import { type NextRequest, NextResponse } from "next/server";
import { getPayloadClient } from "@/server/payload";
import { auth } from "@/server/better-auth";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const alt = (formData.get("alt") as string) ?? "upload";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only images are allowed" }, { status: 400 });
  }

  // 2MB limit
  if (file.size > 2 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 2MB)" }, { status: 400 });
  }

  const payload = await getPayloadClient();

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const media = await payload.create({
    collection: "media",
    data: { alt },
    file: {
      data: buffer,
      name: file.name,
      mimetype: file.type,
      size: file.size,
    },
  });

  return NextResponse.json({ url: media.url });
}
