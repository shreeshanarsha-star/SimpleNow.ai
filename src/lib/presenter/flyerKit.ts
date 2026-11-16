// Presenter.ai — the Claude Code "Flyer.ai" kit: a per-session token lets the
// laptop's Claude Code fetch tonight's brief and publish the app it builds.
import { randomBytes } from "crypto";
import { db } from "@/lib/presenter/server";
import { hubOf, type SessionRow } from "@/lib/presenter/hub";

export async function ensureFlyerToken(session: SessionRow) {
  const state = (session.state || {}) as Record<string, unknown>;
  if (typeof state.flyerToken === "string" && state.flyerToken.length >= 32) return state.flyerToken;
  const token = randomBytes(24).toString("hex");
  await db().from("presenter_sessions").update({ state: { ...state, flyerToken: token } }).eq("id", session.id);
  return token;
}

/** The session whose flyer token matches the Bearer token. */
export async function sessionByFlyerToken(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token.length < 32) return null;
  const { data } = await db().from("presenter_sessions").select("id, code, title, status, state").filter("state->>flyerToken", "eq", token).maybeSingle();
  return (data as SessionRow) || null;
}

export const flyerBuildOf = (s: SessionRow) => hubOf(s).flyerBuild || null;
