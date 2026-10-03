import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guard, ok, readJson, run, uuid } from "@/lib/nrs/invoice/kit";

export const dynamic = "force-dynamic";

// POST {memberId, resend?}  (HR only)
// Give an NR Synergy member a sign-in:
//   - already linked                       -> { status: "already_linked" }
//   - a platform account with this email    -> link it   -> { status: "linked" }
//     (in this org, or in no org yet: the profile then joins this org;
//      an account in ANOTHER org is never moved -> 409)
//   - no account                            -> Supabase invite email, link the new user -> { status: "invited" }
//   - linked, invite not yet accepted, {resend:true} -> invite email again -> { status: "resent" }

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.simplenow.ai";

type InviteStatus = "already_linked" | "linked" | "invited" | "resent";

interface Profile {
  id: string;
  org_id: string | null;
}

function likeExact(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function profileByEmail(admin: SupabaseClient, email: string): Promise<Profile | null> {
  const { data, error } = await admin.from("profiles").select("id, org_id").ilike("email", likeExact(email)).limit(2);
  dbCheck(error, "Account lookup");
  const rows = (data ?? []) as Profile[];
  return rows[0] ?? null;
}

async function profileById(admin: SupabaseClient, id: string): Promise<Profile | null> {
  const { data, error } = await admin.from("profiles").select("id, org_id").eq("id", id).maybeSingle();
  dbCheck(error, "Account lookup");
  return (data as Profile | null) ?? null;
}

/** Auth user id for an email (used when an auth user exists without a profile row). Pages through at most 10k users. */
async function authUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new HttpError(`Account lookup: ${error.message}`, 500);
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}

/** The profile must be in this org or in none (then it joins this org). Never moves an account between orgs. */
async function claimProfile(admin: SupabaseClient, orgId: string, profile: Profile | null): Promise<void> {
  if (!profile) return;
  if (profile.org_id && profile.org_id !== orgId) {
    throw new HttpError(
      "This email already has a SimpleNow account in another organisation, so it can't be linked here. Ask them to use their work email, or contact support.",
      409
    );
  }
  if (!profile.org_id) {
    const { error } = await admin.from("profiles").update({ org_id: orgId }).eq("id", profile.id).is("org_id", null);
    dbCheck(error, "Joining organisation");
  }
}

/** True while an invited auth user has never confirmed or signed in. */
async function invitePending(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data?.user) return false;
  const u = data.user;
  return !u.email_confirmed_at && !u.last_sign_in_at;
}

async function sendInvite(admin: SupabaseClient, email: string, fullName: string) {
  return admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${SITE}/tools/nr-synergy`,
    data: { full_name: fullName },
  });
}

export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    const memberId = uuid(b.memberId ?? b.member_id, "Member");

    const { data, error } = await g.admin
      .from("nrs_members")
      .select("id, email, full_name, user_id, status")
      .eq("id", memberId)
      .eq("org_id", g.orgId)
      .is("deleted_at", null)
      .maybeSingle();
    dbCheck(error, "Member");
    const member = data as { id: string; email: string; full_name: string; user_id: string | null; status: string } | null;
    if (!member) throw new HttpError("Member not found", 404);
    if (member.status !== "active") throw new HttpError("This member is inactive. Reactivate them before inviting.", 409);
    const email = member.email.trim().toLowerCase();

    if (member.user_id) {
      // Linked, but the invite may still be unanswered: resend it on request.
      const pending = await invitePending(g.admin, member.user_id);
      if (!pending || b.resend !== true) return ok({ status: "already_linked" satisfies InviteStatus, linked: true, pending });
      const { error: reErr } = await sendInvite(g.admin, email, member.full_name);
      if (reErr) throw new HttpError(`Couldn't resend the invite: ${reErr.message}`, 502);
      await logAudit(g.admin, { orgId: g.orgId, actorUser: g.user.id, entity: "nrs_members", entityId: member.id, action: "invite_resend" });
      return ok({ status: "resent" satisfies InviteStatus, linked: true, pending: true });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError("This member's email doesn't look valid. Fix it first.");

    let status: InviteStatus;
    let userId: string | null = null;
    let profile = await profileByEmail(g.admin, email);
    if (profile) {
      userId = profile.id;
      status = "linked";
    } else {
      const { data: inv, error: invErr } = await sendInvite(g.admin, email, member.full_name);
      if (inv?.user?.id) {
        userId = inv.user.id;
        status = "invited";
      } else if (invErr && /already|registered|exists/i.test(invErr.message)) {
        // An auth user exists but has no profile row we could match: link by exact auth email.
        userId = await authUserIdByEmail(g.admin, email);
        if (!userId) throw new HttpError("An account exists for this email but couldn't be found. Try again shortly.", 409);
        status = "linked";
      } else {
        throw new HttpError(`Invite failed: ${invErr?.message ?? "unknown error"}`, 502);
      }
      // The signup trigger usually creates the profile with no org.
      profile = await profileById(g.admin, userId);
    }

    // Check every conflict before changing anything.
    if (profile?.org_id && profile.org_id !== g.orgId) {
      throw new HttpError(
        "This email already has a SimpleNow account in another organisation, so it can't be linked here. Ask them to use their work email, or contact support.",
        409
      );
    }
    const { data: taken, error: takenErr } = await g.admin
      .from("nrs_members")
      .select("id")
      .eq("user_id", userId)
      .neq("id", member.id)
      .maybeSingle();
    dbCheck(takenErr, "Account lookup");
    if (taken) throw new HttpError("That account is already linked to another member", 409);

    await claimProfile(g.admin, g.orgId, profile);

    const { data: upd, error: upErr } = await g.admin
      .from("nrs_members")
      .update({ user_id: userId })
      .eq("id", member.id)
      .eq("org_id", g.orgId)
      .is("user_id", null)
      .select("id");
    if (upErr?.code === "23505") throw new HttpError("That account is already linked to another member", 409);
    dbCheck(upErr, "Linking account");
    if (!upd?.length) return ok({ status: "already_linked" satisfies InviteStatus, linked: true });

    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_members",
      entityId: member.id,
      action: status === "invited" ? "invite" : "link_account",
      after: { user_id: userId, status },
    });
    return ok({ status, linked: true, pending: status === "invited" });
  });
}
