"use client";

import { useMemo, useState } from "react";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { NRS_ROLES, type AdminMemberDto, type AdminRole, type FeatureDto } from "@/lib/nrs/invoice/adminTypes";
import { desk } from "@/lib/nrs/i18n/en/desk";
import InviteButton from "./InviteButton";
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, Notice, SectionTitle, api, errorText, fmt, inputCls, todayIso, useLoad } from "@/app/tools/nr-synergy/money/_components/ui";

/** Friendly label for every assignable role (new desk roles live in the desk strings). */
function roleLabel(r: AdminRole): string {
  switch (r) {
    case "travel_desk":
    case "it_agent":
    case "hr_agent":
      return desk.roles[r];
    default:
      return s.users[`role_${r}`];
  }
}

interface UsersData {
  members: AdminMemberDto[];
  features: FeatureDto[];
  countries: { code: string; name: string }[];
}

interface Draft {
  full_name: string;
  email: string;
  designation: string;
  department: string;
  division: string;
  home_country: string;
  manager_id: string;
  joined_on: string;
  status: "active" | "inactive";
  roles: AdminRole[];
  features: Record<string, "default" | "on" | "off">;
  engagement: { type: "consultant" | "payroll"; country_code: string; starts_on: string };
}

function toDraft(m: AdminMemberDto | null, features: FeatureDto[]): Draft {
  const f: Draft["features"] = {};
  for (const x of features) {
    const v = m?.features[x.key];
    f[x.key] = v === undefined ? "default" : v ? "on" : "off";
  }
  return {
    full_name: m?.full_name ?? "",
    email: m?.email ?? "",
    designation: m?.designation ?? "",
    department: m?.department ?? "",
    division: m?.division ?? "",
    home_country: m?.home_country ?? "",
    manager_id: m?.manager_id ?? "",
    joined_on: m?.joined_on ?? "",
    status: m?.status ?? "active",
    roles: m?.roles.length ? m.roles : ["employee"],
    features: f,
    engagement: m?.engagement ?? { type: "consultant", country_code: m?.home_country ?? "", starts_on: m?.joined_on ?? todayIso() },
  };
}

function MemberForm({
  member,
  data,
  onSaved,
  onCancel,
}: {
  member: AdminMemberDto | null;
  data: UsersData;
  onSaved: (msg: string) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(member, data.features));
  const [busy, setBusy] = useState<"save" | "relink" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));

  const countryOptions = data.countries.length ? data.countries : [];
  const managers = data.members.filter((m) => m.id !== member?.id && m.status === "active");

  const save = async () => {
    setBusy("save");
    setError(null);
    const features: Record<string, boolean | null> = {};
    for (const [k, v] of Object.entries(d.features)) features[k] = v === "default" ? null : v === "on";
    const body = {
      full_name: d.full_name,
      email: d.email,
      designation: d.designation,
      department: d.department,
      division: d.division,
      home_country: d.home_country,
      manager_id: d.manager_id || null,
      joined_on: d.joined_on || null,
      roles: d.roles,
      features,
      engagement: d.engagement.country_code && d.engagement.starts_on ? d.engagement : undefined,
      ...(member ? { status: d.status } : {}),
    };
    try {
      if (member) {
        await api(`/api/nr-synergy/admin/members/${member.id}`, { method: "PATCH", body: JSON.stringify(body) });
        onSaved(s.common.saved);
      } else {
        const r = await api<{ linked: boolean }>("/api/nr-synergy/admin/members", { method: "POST", body: JSON.stringify(body) });
        onSaved(r.linked ? s.users.createdLinked : s.users.created);
      }
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const relink = async () => {
    if (!member) return;
    setBusy("relink");
    setError(null);
    try {
      const r = await api<{ linked: boolean }>(`/api/nr-synergy/admin/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ relink: true }),
      });
      setInfo(r.linked ? s.users.relinked : s.users.relinkMissing);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const countrySelect = (id: string, value: string, onChange: (v: string) => void) =>
    countryOptions.length ? (
      <select id={id} required className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {countryOptions.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} ({c.code})
          </option>
        ))}
      </select>
    ) : (
      <input id={id} required maxLength={2} className={inputCls} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} />
    );

  return (
    <Card>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[14px] font-bold text-ink">{member ? fmt(s.users.editTitle, { name: member.full_name }) : s.users.addTitle}</h3>
          {member && (
            <div className="flex items-center gap-2">
              <Badge tone={member.linked ? "approved" : "draft"}>{member.linked ? s.users.linked : s.users.notLinked}</Badge>
              {!member.linked && (
                <Button variant="ghost" busy={busy === "relink"} onClick={() => void relink()}>
                  {s.users.relink}
                </Button>
              )}
            </div>
          )}
        </div>
        {info && <Notice message={info} />}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={s.users.fullName}>
            {(id) => <input id={id} required maxLength={200} className={inputCls} value={d.full_name} onChange={(e) => set("full_name", e.target.value)} />}
          </Field>
          <Field label={s.users.email} hint={s.users.emailHint}>
            {(id, h) => <input id={id} aria-describedby={h} type="email" required className={inputCls} value={d.email} onChange={(e) => set("email", e.target.value)} />}
          </Field>
          <Field label={s.users.designation}>
            {(id) => <input id={id} className={inputCls} value={d.designation} onChange={(e) => set("designation", e.target.value)} />}
          </Field>
          <Field label={s.users.department}>
            {(id) => <input id={id} className={inputCls} value={d.department} onChange={(e) => set("department", e.target.value)} />}
          </Field>
          <Field label={s.users.division}>
            {(id) => <input id={id} className={inputCls} value={d.division} onChange={(e) => set("division", e.target.value)} />}
          </Field>
          <Field label={s.users.homeCountry}>{(id) => countrySelect(id, d.home_country, (v) => set("home_country", v))}</Field>
          <Field label={s.users.manager}>
            {(id) => (
              <select id={id} className={inputCls} value={d.manager_id} onChange={(e) => set("manager_id", e.target.value)}>
                <option value="">{s.users.noManager}</option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label={s.users.joinedOn}>
            {(id) => <input id={id} type="date" className={inputCls} value={d.joined_on} onChange={(e) => set("joined_on", e.target.value)} />}
          </Field>
          {member && (
            <Field label={s.users.status}>
              {(id) => (
                <select id={id} className={inputCls} value={d.status} onChange={(e) => set("status", e.target.value as Draft["status"])}>
                  <option value="active">{s.users.active}</option>
                  <option value="inactive">{s.users.inactive}</option>
                </select>
              )}
            </Field>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-[12.5px] font-bold text-ink mb-1">{s.users.engagement}</legend>
          <p className="text-[11.5px] text-ink-muted">{s.users.engagementHint}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label={s.users.engagementType}>
              {(id) => (
                <select
                  id={id}
                  className={inputCls}
                  value={d.engagement.type}
                  onChange={(e) => set("engagement", { ...d.engagement, type: e.target.value as Draft["engagement"]["type"] })}
                >
                  <option value="consultant">{s.users.consultant}</option>
                  <option value="payroll">{s.users.payroll}</option>
                </select>
              )}
            </Field>
            <Field label={s.users.engagementCountry}>
              {(id) => countrySelect(id, d.engagement.country_code, (v) => set("engagement", { ...d.engagement, country_code: v }))}
            </Field>
            <Field label={s.users.engagementStart}>
              {(id) => (
                <input
                  id={id}
                  type="date"
                  required
                  className={inputCls}
                  value={d.engagement.starts_on}
                  onChange={(e) => set("engagement", { ...d.engagement, starts_on: e.target.value })}
                />
              )}
            </Field>
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-[12.5px] font-bold text-ink mb-1">{s.users.roles}</legend>
          <p className="text-[11.5px] text-ink-muted mb-2">{desk.roles.hint}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {NRS_ROLES.map((r) => (
              <label key={r} className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <input
                  type="checkbox"
                  checked={d.roles.includes(r)}
                  disabled={r === "employee"}
                  onChange={(e) => set("roles", e.target.checked ? [...d.roles, r] : d.roles.filter((x) => x !== r))}
                />
                {roleLabel(r)}
              </label>
            ))}
          </div>
        </fieldset>

        {data.features.length > 0 && (
          <fieldset>
            <legend className="text-[12.5px] font-bold text-ink mb-1">{s.users.features}</legend>
            <p className="text-[11.5px] text-ink-muted mb-2">{s.users.featuresHint}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {data.features.map((f) => (
                <Field key={f.key} label={f.name}>
                  {(id) => (
                    <select
                      id={id}
                      className={inputCls}
                      value={d.features[f.key] ?? "default"}
                      onChange={(e) => set("features", { ...d.features, [f.key]: e.target.value as "default" | "on" | "off" })}
                    >
                      <option value="default">{fmt(s.users.featureDefault, { state: f.default_on ? s.users.on : s.users.off })}</option>
                      <option value="on">{s.users.on}</option>
                      <option value="off">{s.users.off}</option>
                    </select>
                  )}
                </Field>
              ))}
            </div>
          </fieldset>
        )}

        {error && <ErrorBox message={error} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {s.common.cancel}
          </Button>
          <Button type="submit" variant="primary" busy={busy === "save"}>
            {s.common.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function UsersSection() {
  const data = useLoad(() => api<UsersData>("/api/nr-synergy/admin/members"), []);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<AdminMemberDto | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = data.data?.members ?? [];
    if (!needle) return rows;
    return rows.filter((m) =>
      [m.full_name, m.email, m.designation, m.department, m.home_country].some((v) => v?.toLowerCase().includes(needle))
    );
  }, [data.data, q]);
  const names = useMemo(() => new Map((data.data?.members ?? []).map((m) => [m.id, m.full_name])), [data.data]);

  if (data.loading && !data.data) return <Loading label={s.common.loading} />;
  if (data.error || !data.data) return <ErrorBox message={data.error ?? s.common.error} onRetry={data.reload} retryLabel={s.common.retry} />;

  if (editing) {
    return (
      <MemberForm
        key={editing === "new" ? "new" : editing.id}
        member={editing === "new" ? null : editing}
        data={data.data}
        onCancel={() => setEditing(null)}
        onSaved={(msg) => {
          setEditing(null);
          setNotice(msg);
          void data.reload();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionTitle
        title={s.sections.users}
        action={
          <Button variant="primary" onClick={() => setEditing("new")}>
            {s.users.add}
          </Button>
        }
      />
      {notice && <Notice message={notice} />}
      <Field label={s.users.search} className="max-w-[360px]">
        {(id) => <input id={id} type="search" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} />}
      </Field>
      {!filtered.length ? (
        <Card>
          <Empty title={s.users.emptyTitle} body={s.users.emptyBody} />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((m) => (
            <li key={m.id}>
              <Card className="!p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-ink">
                      {m.full_name} {m.is_demo && <Badge tone="draft">{s.common.demo}</Badge>}
                    </p>
                    <p className="text-[12px] text-ink-muted break-all">{m.email}</p>
                    <p className="text-[12px] text-ink-2">
                      {[m.designation, m.home_country, m.engagement ? s.users[m.engagement.type] : null, m.manager_id ? names.get(m.manager_id) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {m.roles
                        .filter((r) => r !== "employee")
                        .map((r) => (
                          <Badge key={r} tone="submitted">
                            {roleLabel(r)}
                          </Badge>
                        ))}
                      {m.status === "inactive" && <Badge tone="cancelled">{s.users.inactive}</Badge>}
                      <Badge tone={m.linked ? "approved" : "draft"}>{m.linked ? s.users.linked : s.users.notLinked}</Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!m.is_demo && m.status === "active" && (
                      <InviteButton
                        key={`${m.id}:${m.linked}:${m.pending ?? false}`}
                        memberId={m.id}
                        linked={m.linked}
                        email={m.email}
                        pending={m.pending}
                        onDone={() => void data.reload()}
                      />
                    )}
                    <Button onClick={() => setEditing(m)} aria-label={`${s.common.edit} ${m.full_name}`}>
                      {s.common.edit}
                    </Button>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
