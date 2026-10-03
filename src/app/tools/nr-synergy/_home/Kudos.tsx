import type { SupabaseClient } from "@supabase/supabase-js";
import { home as s } from "@/lib/nrs/i18n/en/home";
import KudosForm from "./KudosForm";
import { listOrgMembers, memberNames } from "./server";
import { Card, EmptyLine, ErrorLine, Pill, SectionTitle, fill, fmtDate } from "./ui";

interface KudosRow {
  id: string;
  from_member_id: string;
  to_member_id: string;
  value_id: string;
  message: string;
  created_at: string;
}

export default async function Kudos({
  supabase,
  orgId,
  meId,
  tz,
}: {
  supabase: SupabaseClient;
  orgId: string;
  meId: string | null;
  tz: string;
}) {
  let values: { id: string; name: string }[] = [];
  let people: { id: string; full_name: string; designation: string | null }[] = [];
  let recent: KudosRow[] = [];
  let names = new Map<string, string>();
  let failed = false;
  try {
    const [vRes, kRes, members] = await Promise.all([
      supabase.from("nrs_values").select("id, name").eq("org_id", orgId).order("sort", { ascending: true }),
      supabase
        .from("nrs_kudos")
        .select("id, from_member_id, to_member_id, value_id, message, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(8),
      meId ? listOrgMembers(supabase, orgId) : Promise.resolve([]),
    ]);
    if (vRes.error) throw new Error(vRes.error.message);
    if (kRes.error) throw new Error(kRes.error.message);
    values = (vRes.data ?? []) as { id: string; name: string }[];
    recent = (kRes.data ?? []) as KudosRow[];
    people = members.filter((m) => m.id !== meId);
    names = await memberNames(supabase, recent.flatMap((k) => [k.from_member_id, k.to_member_id]));
  } catch (e) {
    console.error("[nrs] kudos", e);
    failed = true;
  }
  const valueName = new Map(values.map((v) => [v.id, v.name]));

  return (
    <Card labelledBy="nrs-kudos">
      <SectionTitle id="nrs-kudos">{s.kudos.title}</SectionTitle>
      {failed ? (
        <ErrorLine>{s.sectionError}</ErrorLine>
      ) : (
        <div className="flex flex-col gap-4">
          {meId &&
            (values.length === 0 ? (
              <EmptyLine>{s.kudos.noValues}</EmptyLine>
            ) : (
              <KudosForm values={values} people={people} />
            ))}
          <div>
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-ink-muted mb-1.5">{s.kudos.recent}</h3>
            {recent.length === 0 ? (
              <EmptyLine>{s.kudos.recentEmpty}</EmptyLine>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {recent.map((k) => (
                  <li key={k.id} className="py-2.5 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <p className="text-[12.5px] font-bold text-ink">
                        {fill(s.kudos.line, { from: names.get(k.from_member_id) ?? "", to: names.get(k.to_member_id) ?? "" })}
                      </p>
                      {valueName.get(k.value_id) && <Pill tone="brand">{valueName.get(k.value_id)}</Pill>}
                    </div>
                    <p className="text-[12.5px] text-ink-2 break-words">{k.message}</p>
                    <p className="text-[11px] text-ink-muted">{fmtDate(k.created_at, tz)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
