"use client";

import { useMemo, useState } from "react";

interface Profile {
  id: string;
  email: string | null;
  is_admin: boolean;
  org_id: string | null;
  org_role: string | null;
  is_anonymous?: boolean | null;
  created_at: string;
}

export default function UsersList({
  profiles,
  orgNameById,
}: {
  profiles: Profile[];
  orgNameById: Map<string, string>;
}) {
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return profiles.filter((p) => {
      const orgName = p.org_id ? orgNameById.get(p.org_id) || "" : "";
      if (needle && !(p.email || "").toLowerCase().includes(needle) && !orgName.toLowerCase().includes(needle)) {
        return false;
      }
      if (roleFilter === "owner" && !p.is_admin) return false;
      if (roleFilter === "org_admin" && p.org_role !== "org_admin") return false;
      if (roleFilter === "member" && !(p.org_id && p.org_role !== "org_admin" && !p.is_admin)) return false;
      if (roleFilter === "no_org" && (p.org_id || p.is_admin)) return false;
      return true;
    });
  }, [profiles, orgNameById, q, roleFilter]);

  return (
    <>
      <div className="flex gap-2 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by email or organization…"
          className="input flex-1 max-w-[320px] text-[13px]"
        />
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="input max-w-[180px] text-[13px]">
          <option value="all">All roles</option>
          <option value="owner">Platform owner</option>
          <option value="org_admin">Org admin</option>
          <option value="member">Org member</option>
          <option value="no_org">No organization</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-border rounded-md px-4 py-6 text-center text-[13px] text-ink-muted">
          No users match that search.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((profile) => (
            <div
              key={profile.id}
              className="border border-border rounded-md bg-surface px-4 py-3 flex items-center gap-3 flex-wrap"
            >
              <div className="w-8 h-8 rounded-full bg-ink text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                {(profile.email || "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-medium truncate">{profile.email}</div>
                <div className="text-[11px] text-ink-muted" suppressHydrationWarning>
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
    </>
  );
}
