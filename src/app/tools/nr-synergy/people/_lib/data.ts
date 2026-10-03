import type { SupabaseClient } from "@supabase/supabase-js";

// Directory loader shared by the People page and GET /api/nr-synergy/people.
// Uses the caller's RLS client: nrs_members is readable org-wide.

export interface DirectoryPerson {
  id: string;
  full_name: string;
  email: string;
  designation: string | null;
  department: string | null;
  division: string | null;
  home_country: string;
  manager_id: string | null;
  languages: string[];
  bio: string | null;
  avatar_url: string | null;
  joined_on: string | null;
}

export interface DirectoryCountry {
  code: string;
  name: string;
  timezone: string;
}

export interface Directory {
  people: DirectoryPerson[];
  countries: DirectoryCountry[];
}

export async function loadDirectory(supabase: SupabaseClient, orgId: string): Promise<Directory> {
  const [peopleRes, countriesRes] = await Promise.all([
    supabase
      .from("nrs_members")
      .select(
        "id, full_name, email, designation, department, division, home_country, manager_id, languages, bio, avatar_url, joined_on"
      )
      .eq("org_id", orgId)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("full_name", { ascending: true }),
    supabase.from("nrs_countries").select("code, name, timezone").eq("org_id", orgId).order("name", { ascending: true }),
  ]);
  if (peopleRes.error) throw new Error(peopleRes.error.message);
  if (countriesRes.error) throw new Error(countriesRes.error.message);
  const people = ((peopleRes.data ?? []) as DirectoryPerson[]).map((p) => ({ ...p, languages: p.languages ?? [] }));
  return { people, countries: (countriesRes.data ?? []) as DirectoryCountry[] };
}
