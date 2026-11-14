import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@/server/better-auth";
import { db } from "@/server/db";
import {
  ProfilePhotoRejectedError,
  setProfilePhoto,
} from "@/server/members/profile-photo";
import { getPayloadClient } from "@/server/payload";

/**
 * Uploads the signed-in member's profile photo and shows it as their
 * picture, in one step (multipart `file`). Removing it is
 * `members.removeProfilePhoto`.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  try {
    const result = await setProfilePhoto(
      { db, payload: await getPayloadClient() },
      {
        userId: session.user.id,
        file: {
          data: Buffer.from(await file.arrayBuffer()),
          mimetype: file.type,
        },
      },
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ProfilePhotoRejectedError) {
      return NextResponse.json(
        { error: error.message, reason: error.reason },
        { status: 400 },
      );
    }
    throw error;
  }
}
