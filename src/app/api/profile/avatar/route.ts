import { NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/requireAdmin";
import { createAdminClient } from "@/lib/supabase/admin";

// Personal profile picture -- any signed-in user may set their own, no
// org/feature gate needed (same "everyone gets this" rule as Personal
// Tools). Path is always the caller's own auth uid (never client-supplied),
// so there's no way to overwrite someone else's avatar even though this
// uses the admin client.
const MAX_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: Request) {
  let user;
  try {
    ({ user } = await requireUser());
  } catch (res) {
    return res as Response;
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "Please upload a PNG, JPG, WEBP, or GIF image." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be under 4MB." }, { status: 400 });
  }

  const admin = createAdminClient();
  const path = `${user.id}/avatar.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from("avatars")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: pub } = admin.storage.from("avatars").getPublicUrl(path);
  // Cache-bust: the path is stable per-user (we always overwrite the same
  // file), so without this the browser/CDN would keep serving the old
  // image after a re-upload.
  const avatarUrl = `${pub.publicUrl}?t=${Date.now()}`;

  const { error: dbError } = await admin
    .from("profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", user.id);
  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ avatarUrl });
}

export async function DELETE() {
  let user;
  try {
    ({ user } = await requireUser());
  } catch (res) {
    return res as Response;
  }
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ avatar_url: null }).eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
