import type { SupabaseClient } from "@supabase/supabase-js";
import { home as s } from "@/lib/nrs/i18n/en/home";
import { Card, EmptyLine, ErrorLine, Pill, SectionTitle, fmtDateTime, linkClass } from "./ui";

interface EventRow {
  id: string;
  kind: "townhall" | "training" | "tradefair" | "other";
  title: string;
  starts_at: string;
  location: string | null;
  link: string | null;
}

export default async function Events({ supabase, orgId, tz }: { supabase: SupabaseClient; orgId: string; tz: string }) {
  const { data, error } = await supabase
    .from("nrs_events")
    .select("id, kind, title, starts_at, location, link")
    .eq("org_id", orgId)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(6);
  if (error) console.error("[nrs] events", error.message);
  const events = (data ?? []) as EventRow[];

  return (
    <Card labelledBy="nrs-events">
      <SectionTitle id="nrs-events">{s.events.title}</SectionTitle>
      {error ? (
        <ErrorLine>{s.sectionError}</ErrorLine>
      ) : events.length === 0 ? (
        <EmptyLine>{s.events.empty}</EmptyLine>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {events.map((ev) => {
            const link = ev.link && /^https:\/\//i.test(ev.link) ? ev.link : null;
            return (
              <li key={ev.id} className="py-2.5 flex flex-col gap-1">
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className="text-[13px] font-bold text-ink break-words min-w-0">{ev.title}</p>
                  <Pill>{s.events.kind[ev.kind]}</Pill>
                </div>
                <p className="text-[12px] text-ink-2">
                  <time dateTime={ev.starts_at}>{fmtDateTime(ev.starts_at, tz)}</time>
                  {ev.location ? ` · ${ev.location}` : ""}
                </p>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" className={`${linkClass} text-[12px] self-start`}>
                    {s.events.join}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
