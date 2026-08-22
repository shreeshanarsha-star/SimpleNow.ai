import AppShell from "@/components/AppShell";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, is_admin, org_id, org_role, created_at")
    .order("created_at", { ascending: true });

  const { data: orgs } = await supabase.from("organizations").select("id, name");
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <AppShell title="Admin — Users">
      <AdminNav />
      <div className="mb-6">
        <h2 className="m-0 text-[19px] font-bold">Users</h2>
        <p className="m-0 mt-1 text-[13px] text-ink-muted">
          Every registered account, platform-wide. Tool access is granted per organization now
          — manage that from{" "}
          <Link href="/admin/organizations" className="text-brand font-bold">
            Organizations
          </Link>
          .
        </p>
      </div>

      {error && (
        <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
          Could not load users: {error.message}
        </div>
      )}

      {(profiles ?? []).length === 0 ? (
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          No one has registered yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {(profiles ?? []).map((profile) => (
            <div
              key={profile.id}
              className="border border-border rounded-md bg-surface px-4 py-3 flex items-center gap-3 flex-wrap"
            >
              <div className="w-8 h-8 rounded-full bg-ink text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {(profile.email || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium truncate">{profile.email}</div>
                <div className="text-[11px] text-ink-muted">
                  Joined {new Date(profile.created_at).toLocaleDateString()}
                </div>
              </div>
              {profile.is_admin && (
                <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-brand-wash text-brand">
                  Platform owner
                </span>
              )}
              {profile.org_id ? (
                <span className="text-[11px] text-ink-2 flex items-center gap-1.5">
                  {orgNameById.get(profile.org_id) || "Unknown org"}
                  {profile.org_role === "org_admin" && (
                    <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-page text-ink-muted">
                      org admin
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-[11px] text-ink-muted">No organization yet</span>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
