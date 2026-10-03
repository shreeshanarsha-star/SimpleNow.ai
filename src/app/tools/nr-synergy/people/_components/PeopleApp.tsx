"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import { people as s, fillPeople as fill } from "@/lib/nrs/i18n/en/people";
import type { DirectoryCountry, DirectoryPerson } from "../_lib/data";

type View = "directory" | "org";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function Avatar({ person, size = "md" }: { person: DirectoryPerson; size?: "md" | "lg" }) {
  const cls = size === "lg" ? "w-16 h-16 text-[20px]" : "w-10 h-10 text-[13px]";
  if (person.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={person.avatar_url} alt="" className={`${cls} rounded-full object-cover shrink-0 bg-page`} />
    );
  }
  return (
    <span aria-hidden className={`${cls} rounded-full bg-brand-wash text-brand-dark font-bold flex items-center justify-center shrink-0`}>
      {initials(person.full_name)}
    </span>
  );
}

function uniqueSorted(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v && !!v.trim()))).sort((a, b) => a.localeCompare(b));
}

const selectCls =
  "w-full rounded-sm border border-border bg-surface px-3 py-2 text-[13px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export default function PeopleApp({
  people,
  countries,
  meId,
}: {
  people: DirectoryPerson[];
  countries: DirectoryCountry[];
  meId: string | null;
}) {
  const [view, setView] = useState<View>("directory");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("");
  const [department, setDepartment] = useState("");
  const [division, setDivision] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  // Deep link from global search: /tools/nr-synergy/people?member=<id> opens that profile.
  const memberParam = useSearchParams()?.get("member") ?? null;
  useEffect(() => {
    if (memberParam && people.some((p) => p.id === memberParam)) setOpenId(memberParam);
  }, [memberParam, people]);

  const closeProfile = () => {
    setOpenId(null);
    // Drop ?member= so the same search result can reopen the drawer later.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("member")) {
        url.searchParams.delete("member");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    } catch {
      // ignore: URL clean-up is cosmetic
    }
  };

  const countryByCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const reportsOf = useMemo(() => {
    const map = new Map<string, DirectoryPerson[]>();
    for (const p of people) {
      if (p.manager_id && byId.has(p.manager_id)) map.set(p.manager_id, [...(map.get(p.manager_id) ?? []), p]);
    }
    return map;
  }, [people, byId]);

  const countryOptions = uniqueSorted(people.map((p) => p.home_country));
  const departmentOptions = uniqueSorted(people.map((p) => p.department));
  const divisionOptions = uniqueSorted(people.map((p) => p.division));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (country && p.home_country !== country) return false;
      if (department && p.department !== department) return false;
      if (division && p.division !== division) return false;
      if (!q) return true;
      const hay = [p.full_name, p.email, p.designation, p.department, p.division, countryByCode.get(p.home_country)?.name, ...p.languages]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [people, query, country, department, division, countryByCode]);

  const hasFilters = !!(query || country || department || division);
  const countryLabel = (code: string) => countryByCode.get(code)?.name ?? code;
  const open = openId ? byId.get(openId) ?? null : null;

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label={s.viewsLabel} className="inline-flex self-start rounded-md border border-border p-0.5 bg-surface">
        {(["directory", "org"] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => setView(v)}
            className={`px-3 py-1.5 rounded-sm text-[12.5px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              view === v ? "bg-brand-wash text-brand-dark" : "text-ink-2 hover:text-ink"
            }`}
          >
            {v === "directory" ? s.viewDirectory : s.viewOrgChart}
          </button>
        ))}
      </div>

      {view === "directory" ? (
        <>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
            <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
              <span className="text-[11.5px] font-semibold text-ink-muted">{s.searchLabel}</span>
              <span className="relative">
                <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={s.searchPlaceholder}
                  className={`${selectCls} pl-9`}
                />
              </span>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-ink-muted">{s.filterCountry}</span>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectCls}>
                <option value="">{s.filterAll}</option>
                {countryOptions.map((c) => (
                  <option key={c} value={c}>
                    {countryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-ink-muted">{s.filterDepartment}</span>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className={selectCls}>
                <option value="">{s.filterAll}</option>
                {departmentOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11.5px] font-semibold text-ink-muted">{s.filterDivision}</span>
              <select value={division} onChange={(e) => setDivision(e.target.value)} className={selectCls}>
                <option value="">{s.filterAll}</option>
                {divisionOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 text-[12px] text-ink-muted">
            <span aria-live="polite">
              {filtered.length === 1 ? s.resultCountOne : fill(s.resultCount, { count: filtered.length })}
            </span>
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setCountry("");
                  setDepartment("");
                  setDivision("");
                }}
                className="font-semibold text-brand-dark hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-sm"
              >
                {s.clearFilters}
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-10 text-center">
              <p className="text-[14px] font-bold text-ink">{s.noMatchTitle}</p>
              <p className="text-[12.5px] text-ink-muted mt-1">{s.noMatchBody}</p>
            </div>
          ) : (
            <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    aria-label={fill(s.openProfile, { name: p.full_name })}
                    className="w-full text-left flex items-center gap-3 rounded-md border border-border bg-surface p-3 hover:border-brand/40 hover:shadow-soft-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Avatar person={p} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="block truncate text-[13.5px] font-bold text-ink">{p.full_name}</span>
                        {p.id === meId && (
                          <span className="shrink-0 rounded-full bg-brand-wash px-1.5 text-[10px] font-bold text-brand-dark">{s.you}</span>
                        )}
                      </span>
                      <span className="block truncate text-[12px] text-ink-2">{p.designation ?? p.department ?? ""}</span>
                      <span className="block truncate text-[11.5px] text-ink-muted">
                        {[countryLabel(p.home_country), p.division].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <OrgChart people={people} byId={byId} reportsOf={reportsOf} onOpen={setOpenId} meId={meId} />
      )}

      {open && (
        <ProfileDrawer
          person={open}
          country={countryByCode.get(open.home_country) ?? null}
          manager={open.manager_id ? byId.get(open.manager_id) ?? null : null}
          reports={reportsOf.get(open.id) ?? []}
          onOpen={setOpenId}
          onClose={closeProfile}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Org chart
// ---------------------------------------------------------------------------

function OrgChart({
  people,
  byId,
  reportsOf,
  onOpen,
  meId,
}: {
  people: DirectoryPerson[];
  byId: Map<string, DirectoryPerson>;
  reportsOf: Map<string, DirectoryPerson[]>;
  onOpen: (id: string) => void;
  meId: string | null;
}) {
  // Roots: no manager, or a manager outside the visible directory. Anyone
  // caught in a reporting cycle is attached at the top so they never vanish.
  const roots = useMemo(() => {
    const top = people.filter((p) => !p.manager_id || !byId.has(p.manager_id));
    const reached = new Set<string>();
    const walk = (id: string) => {
      if (reached.has(id)) return;
      reached.add(id);
      for (const r of reportsOf.get(id) ?? []) walk(r.id);
    };
    top.forEach((p) => walk(p.id));
    const out = [...top];
    for (const p of people) {
      if (!reached.has(p.id)) {
        walk(p.id);
        out.push(p);
      }
    }
    return out;
  }, [people, byId, reportsOf]);

  const hasLines = people.some((p) => p.manager_id && byId.has(p.manager_id));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-ink-muted">{hasLines ? s.orgChartHint : s.orgChartEmpty}</p>
      <ul role="tree" aria-label={s.viewOrgChart} className="flex flex-col gap-1 overflow-x-auto">
        {roots.map((p) => (
          <OrgNode key={p.id} person={p} reportsOf={reportsOf} onOpen={onOpen} depth={0} seen={new Set()} meId={meId} />
        ))}
      </ul>
    </div>
  );
}

function OrgNode({
  person,
  reportsOf,
  onOpen,
  depth,
  seen,
  meId,
}: {
  person: DirectoryPerson;
  reportsOf: Map<string, DirectoryPerson[]>;
  onOpen: (id: string) => void;
  depth: number;
  seen: Set<string>;
  meId: string | null;
}) {
  const reports = seen.has(person.id) ? [] : reportsOf.get(person.id) ?? [];
  const [expanded, setExpanded] = useState(depth < 2);
  const nextSeen = useMemo(() => new Set([...seen, person.id]), [seen, person.id]);

  return (
    <li role="treeitem" aria-expanded={reports.length ? expanded : undefined} aria-selected={false} className="min-w-[260px]">
      <div className="flex items-center gap-1.5" style={{ paddingLeft: `${Math.min(depth, 8) * 16}px` }}>
        {reports.length ? (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            aria-label={fill(expanded ? s.collapse : s.expand, { name: person.full_name })}
            className="w-7 h-7 shrink-0 rounded-sm text-ink-muted hover:bg-page flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name={expanded ? "chevronDown" : "chevronRight"} className="w-4 h-4" />
          </button>
        ) : (
          <span className="w-7 shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onOpen(person.id)}
          aria-label={fill(s.openProfile, { name: person.full_name })}
          className={`flex-1 min-w-0 text-left flex items-center gap-2.5 rounded-sm border px-2.5 py-1.5 hover:border-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            person.id === meId ? "border-brand/50 bg-brand-wash" : "border-border bg-surface"
          }`}
        >
          <Avatar person={person} />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold text-ink">{person.full_name}</span>
            <span className="block truncate text-[11.5px] text-ink-muted">
              {[person.designation, reports.length ? fill(s.reportsCount, { count: reports.length }) : null]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </button>
      </div>
      {reports.length > 0 && expanded && (
        <ul role="group" className="flex flex-col gap-1 mt-1">
          {reports.map((r) => (
            <OrgNode key={r.id} person={r} reportsOf={reportsOf} onOpen={onOpen} depth={depth + 1} seen={nextSeen} meId={meId} />
          ))}
        </ul>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Profile drawer
// ---------------------------------------------------------------------------

function useLocalTime(tz: string | null): string | null {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);
  if (!tz) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    }).format(now);
  } catch {
    return null;
  }
}

function ProfileDrawer({
  person,
  country,
  manager,
  reports,
  onOpen,
  onClose,
}: {
  person: DirectoryPerson;
  country: DirectoryCountry | null;
  manager: DirectoryPerson | null;
  reports: DirectoryPerson[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const localTime = useLocalTime(country?.timezone ?? null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  useEffect(() => {
    closeRef.current?.focus();
  }, [person.id]);

  const rows: { label: string; value: React.ReactNode }[] = [
    { label: s.designation, value: person.designation },
    { label: s.department, value: person.department },
    { label: s.division, value: person.division },
    { label: s.country, value: country?.name ?? person.home_country },
    {
      label: s.email,
      value: (
        <a href={`mailto:${person.email}`} className="text-brand-dark hover:underline break-all">
          {person.email}
        </a>
      ),
    },
    { label: s.languages, value: person.languages.length ? person.languages.join(", ") : null },
    {
      label: s.joined,
      value: person.joined_on
        ? new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(
            new Date(`${person.joined_on}T00:00:00Z`)
          )
        : null,
    },
  ].filter((r) => r.value);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label={s.closeProfile} tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-black/30" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={fill(s.drawerLabel, { name: person.full_name })}
        className="relative h-full w-full max-w-[420px] bg-surface shadow-panel-right overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar person={person} size="lg" />
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-ink truncate">{person.full_name}</h2>
              {person.designation && <p className="text-[12.5px] text-ink-2 truncate">{person.designation}</p>}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={s.closeProfile}
            className="w-9 h-9 shrink-0 rounded-sm text-ink-muted hover:bg-page flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Icon name="x" className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-5">
          <div className="rounded-md bg-brand-wash px-3 py-2.5 flex items-center gap-2.5">
            <Icon name="clock" className="w-4 h-4 text-brand-dark shrink-0" />
            <div>
              <p className="text-[11px] font-semibold text-ink-muted">{s.localTime}</p>
              <p className="text-[14px] font-bold text-ink">{localTime ?? s.localTimeUnknown}</p>
            </div>
          </div>

          <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-[12.5px]">
            {rows.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-ink-muted">{r.label}</dt>
                <dd className="text-ink min-w-0">{r.value}</dd>
              </div>
            ))}
          </dl>

          {person.bio && (
            <div>
              <h3 className="text-[12px] font-bold text-ink-muted uppercase tracking-wide mb-1">{s.about}</h3>
              <p className="text-[13px] text-ink-2 leading-relaxed whitespace-pre-line">{person.bio}</p>
            </div>
          )}

          <div>
            <h3 className="text-[12px] font-bold text-ink-muted uppercase tracking-wide mb-1.5">{s.manager}</h3>
            {manager ? (
              <PersonLink person={manager} onOpen={onOpen} />
            ) : (
              <p className="text-[12.5px] text-ink-muted">{s.noManager}</p>
            )}
          </div>

          {reports.length > 0 && (
            <div>
              <h3 className="text-[12px] font-bold text-ink-muted uppercase tracking-wide mb-1.5">
                {s.directReports} ({reports.length})
              </h3>
              <ul className="flex flex-col gap-1.5">
                {reports.map((r) => (
                  <li key={r.id}>
                    <PersonLink person={r} onOpen={onOpen} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PersonLink({ person, onOpen }: { person: DirectoryPerson; onOpen: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(person.id)}
      aria-label={fill(s.openProfile, { name: person.full_name })}
      className="w-full text-left flex items-center gap-2.5 rounded-sm border border-border px-2.5 py-1.5 hover:border-brand/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Avatar person={person} />
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-ink">{person.full_name}</span>
        {person.designation && <span className="block truncate text-[11.5px] text-ink-muted">{person.designation}</span>}
      </span>
    </button>
  );
}
