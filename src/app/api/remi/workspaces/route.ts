import { handle, requireRemiUser, clean, audit, jsonError } from "@/lib/remi/access";

export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

// GET: the caller's Dr.Remi workspaces (and auto-accepts pending invites
// addressed to their verified email). POST: create a new workspace.
export async function GET() {
  return handle(async () => {
    const { user, admin } = await requireRemiUser();
    const email = (user.email || "").toLowerCase();
    // Only a VERIFIED email can claim an invite.
    if (email && (user as { email_confirmed_at?: string | null }).email_confirmed_at) {
      const { data: invites } = await admin.from("remi_invites").select("id,workspace_id,role").ilike("email", email);
      for (const inv of invites || []) {
        await admin
          .from("remi_members")
          .upsert({ workspace_id: inv.workspace_id, user_id: user.id, role: inv.role, email }, { onConflict: "workspace_id,user_id", ignoreDuplicates: true });
        await admin.from("remi_invites").delete().eq("id", inv.id);
        await audit(admin, inv.workspace_id, user.id, "invite.accepted", { email, role: inv.role });
      }
    }
    const { data } = await admin
      .from("remi_members")
      .select("role, remi_workspaces(id,slug,name,assistant_name,tagline,active,created_at)")
      .eq("user_id", user.id);
    const workspaces = (data || [])
      .map((m) => ({ role: m.role as string, ...(m.remi_workspaces as unknown as Record<string, unknown>) }) as Record<string, unknown>)
      .filter((w) => w.id);
    return Response.json({ workspaces, me: { id: user.id, email: user.email } });
  });
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
}

export async function POST(req: Request) {
  return handle(async () => {
    const { user, admin } = await requireRemiUser();
    const body = await req.json().catch(() => ({}));
    const name = clean(body.name, 120);
    if (!name || name.length < 2) return jsonError("Please enter your company or brand name.", 400);

    const { count } = await admin.from("remi_members").select("workspace_id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "owner");
    if ((count || 0) >= 5) return jsonError("You can own up to 5 Dr.Remi workspaces.", 400);

    let base = slugify(clean(body.slug, 40) || name);
    if (base.length < 3) base = `${base}-sales`.replace(/^-/, "");
    let slug = base;
    for (let i = 0; i < 6; i++) {
      const { data: taken } = await admin.from("remi_workspaces").select("id").eq("slug", slug).maybeSingle();
      if (!taken) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const { data: ws, error } = await admin
      .from("remi_workspaces")
      .insert({
        slug,
        name,
        industry: clean(body.industry, 120),
        about: clean(body.about, 1500),
        assistant_name: clean(body.assistant_name, 40) || "Dr.Remi",
        notify_emails: user.email ? [user.email] : [],
        consent_text:
          "May I save your contact details so our team can follow up with you? We'll use them only for this enquiry.",
        handoff_message: "I'll connect you with the right specialist, who will get back to you shortly.",
        suggested_questions: [
          "Which product is right for me?",
          "What results can I expect?",
          "Is it available in my country?",
          "Can I get a quote?",
        ],
        created_by: user.id,
      })
      .select("id,slug,name,assistant_name")
      .single();
    if (error || !ws) return jsonError(error?.message || "Couldn't create the workspace.", 500);
    await admin.from("remi_members").insert({ workspace_id: ws.id, user_id: user.id, role: "owner", email: user.email });
    await audit(admin, ws.id, user.id, "workspace.created", { name });
    return Response.json({ workspace: { ...ws, role: "owner" } });
  });
}
