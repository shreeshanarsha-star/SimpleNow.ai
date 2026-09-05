import AppShell from "@/components/AppShell";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "@/components/admin/AdminNav";
import UsersList from "@/components/admin/UsersList";

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
        <UsersList profiles={profiles ?? []} orgNameById={orgNameById} />
      )}
    </AppShell>
  );
}
