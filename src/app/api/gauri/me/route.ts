import { NextResponse } from "next/server";
import { getSessionAccount } from "@/lib/gauriAuth";

export const dynamic = "force-dynamic";

// Ported verbatim from askshree-app (v1)'s app/api/gauri/me/route.js.
export async function GET(req: Request) {
  const account = await getSessionAccount(req);
  return NextResponse.json({ account });
}
