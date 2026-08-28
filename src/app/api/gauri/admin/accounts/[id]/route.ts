import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionAccount } from "@/lib/gauriAuth";

export const dynamic = "force-dynamic";

// Soft-delete only — sets active:false rather than deleting the row, so
// gauri_cases.vet_id foreign keys and audit history stay intact.
// Ported verbatim from askshree-app (v1)'s
// app/api/gauri/admin/accounts/[id]/route.js.
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getSessionAccount(req);
  if (!account || account.role !== "admin") {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }
  const db = createAdminClient();
  await db.from("gauri_accounts").update({ active: false }).eq("id", id);
  return NextResponse.json({ ok: true });
}
