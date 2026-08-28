import { NextResponse } from "next/server";
import { verifyLogin, createSession, SESSION_COOKIE } from "@/lib/gauriAuth";

export const dynamic = "force-dynamic";

// Ported verbatim from askshree-app (v1)'s app/api/gauri/login/route.js.
export async function POST(req: Request) {
  const { username, password } = await req.json();
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: "Enter a username and password." }, { status: 400 });
  }
  const account = await verifyLogin(username.trim(), password);
  if (!account) {
    return NextResponse.json({ ok: false, error: "Incorrect username or password." }, { status: 401 });
  }
  const { token, expiresAt } = await createSession(account.id);
  const res = NextResponse.json({ ok: true, account });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
  return res;
}
