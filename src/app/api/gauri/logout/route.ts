import { NextResponse } from "next/server";
import { destroySession, SESSION_COOKIE } from "@/lib/gauriAuth";

export const dynamic = "force-dynamic";

// Ported verbatim from askshree-app (v1)'s app/api/gauri/logout/route.js.
export async function POST(req: Request) {
  const token = req.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")[1];
  await destroySession(token);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", expires: new Date(0) });
  return res;
}
