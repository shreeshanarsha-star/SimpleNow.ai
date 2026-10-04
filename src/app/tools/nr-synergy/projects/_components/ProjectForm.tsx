"use client";

import Link from "next/link";
import { useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { projects as s } from "@/lib/nrs/i18n/en/projects";
import { postJson } from "../../time/_lib/client";
import { ErrorLine, fill, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "../../_home/ui";
import { PROJECT_STATUSES, isProjectStatus, type ProjectStatus } from "../_lib";

export interface ProjectFormValues {
  name: string;
  description: string;
  owner_member_id: string;
  status: ProjectStatus;
  value_amount: string;
  value_currency: string;
  next_steps: string;
  tags: string;
  division: string;
  country_code: string;
  member_ids: string[];
}

export interface PersonOption {
  id: string;
  full_name: string;
  designation: string | null;
}

export type ProjectFormMode = "create" | "resubmit" | "update";

export default function ProjectForm({
  mode,
  projectId,
  initial,
  people,
  meId,
  countries,
  currencies,
  divisions,
  cancelHref,
  canAssignOwner = false,
  canSetStatus = false,
}: {
  mode: ProjectFormMode;
  projectId?: string;
  initial: ProjectFormValues;
  people: PersonOption[];
  meId: string;
  countries: { code: string; name: string }[];
  currencies: string[];
  divisions: string[];
  cancelHref: string;
  /** HR, or the owner's manager when editing. Others always own what they start. */
  canAssignOwner?: boolean;
  /** HR, or the owner's manager. Others suggest a status in the weekly update. */
  canSetStatus?: boolean;
}) {
  const uid = useId();
  const router = useRouter();
  const [v, setV] = useState<ProjectFormValues>(initial);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const f = (n: string) => `${uid}-${n}`;

  const set = <K extends keyof ProjectFormValues>(k: K, val: ProjectFormValues[K]) => setV((prev) => ({ ...prev, [k]: val }));

  const selected = useMemo(() => new Set([v.owner_member_id, ...v.member_ids]), [v.owner_member_id, v.member_ids]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? people.filter((p) => p.full_name.toLowerCase().includes(q) || (p.designation ?? "").toLowerCase().includes(q))
      : people;
    return list.slice(0, 80);
  }, [people, query]);

  function toggle(id: string) {
    if (id === v.owner_member_id) return;
    set("member_ids", v.member_ids.includes(id) ? v.member_ids.filter((m) => m !== id) : [...v.member_ids, id]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!v.name.trim()) return setError(s.form.nameRequired);
    if (!v.description.trim()) return setError(s.form.descriptionRequired);
    const amount = v.value_amount.replace(/[,\s_]/g, "");
    if (amount && !/^\d+(\.\d+)?$/.test(amount)) return setError(s.form.amountInvalid);
    if (amount && !v.value_currency) return setError(s.form.currencyRequired);

    const payload = {
      ...(mode === "create" ? {} : { action: mode }),
      name: v.name,
      description: v.description,
      ...(canAssignOwner ? { owner_member_id: v.owner_member_id } : {}),
      ...(canSetStatus ? { status: v.status } : {}),
      value_amount: amount || null,
      value_currency: amount ? v.value_currency : null,
      next_steps: v.next_steps,
      tags: v.tags,
      division: v.division,
      country_code: v.country_code || null,
      member_ids: v.member_ids.filter((id) => id !== v.owner_member_id),
    };
    setPending(true);
    const url = mode === "create" ? "/api/nr-synergy/projects" : `/api/nr-synergy/projects/${projectId}`;
    const res = await postJson<{ id: string }>(url, payload);
    setPending(false);
    if (!res.ok) return setError(res.error);
    const id = res.data.id ?? projectId;
    router.push(mode === "update" ? `/tools/nr-synergy/projects/${id}` : `/tools/nr-synergy/projects?submitted=${id}`);
    router.refresh();
  }

  const submitLabel = mode === "create" ? s.form.submit : mode === "resubmit" ? s.form.resubmit : s.form.saveChanges;
  const opt = <span className="font-normal text-ink-muted"> ({s.fields.optional})</span>;
  const nameOf = (p: PersonOption) => (p.id === meId ? `${p.full_name} (${s.you})` : p.full_name);
  const ownerPerson = people.find((p) => p.id === v.owner_member_id);
  const ownerName = ownerPerson ? nameOf(ownerPerson) : v.owner_member_id === meId ? s.you : "—";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate aria-busy={pending}>
      <fieldset className="flex flex-col gap-3 min-w-0">
        <div>
          <label htmlFor={f("name")} className={labelClass}>
            {s.fields.name}
          </label>
          <input
            id={f("name")}
            className={inputClass}
            maxLength={200}
            required
            autoComplete="off"
            value={v.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={f("desc")} className={labelClass}>
            {s.fields.description}
          </label>
          <textarea
            id={f("desc")}
            className={inputClass}
            rows={4}
            maxLength={4000}
            required
            value={v.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            {canAssignOwner ? (
              <>
                <label htmlFor={f("owner")} className={labelClass}>
                  {s.fields.owner}
                </label>
                <select id={f("owner")} className={inputClass} value={v.owner_member_id} onChange={(e) => set("owner_member_id", e.target.value)}>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {nameOf(p)}
                      {p.designation ? ` · ${p.designation}` : ""}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <p className={labelClass}>{s.fields.owner}</p>
                <p className="text-[13px] text-ink py-2">{ownerName}</p>
              </>
            )}
          </div>
          <div>
            {canSetStatus ? (
              <>
                <label htmlFor={f("status")} className={labelClass}>
                  {s.fields.status}
                </label>
                <select
                  id={f("status")}
                  className={inputClass}
                  value={v.status}
                  onChange={(e) => {
                    if (isProjectStatus(e.target.value)) set("status", e.target.value);
                  }}
                >
                  {PROJECT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {s.status[st]}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <p className={labelClass}>{s.fields.status}</p>
                <p className="text-[13px] text-ink pt-2">{s.status[v.status]}</p>
                <p className="text-[11.5px] text-ink-muted">{mode === "create" ? s.form.statusStartsPending : s.form.statusSetByManager}</p>
              </>
            )}
          </div>
        </div>

        <fieldset className="min-w-0">
          <legend className={labelClass}>
            {s.fields.value}
            {opt}
          </legend>
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
            <div>
              <label htmlFor={f("amount")} className="sr-only">
                {s.fields.amount}
              </label>
              <input
                id={f("amount")}
                className={inputClass}
                inputMode="decimal"
                placeholder="250000"
                autoComplete="off"
                value={v.value_amount}
                onChange={(e) => set("value_amount", e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={f("currency")} className="sr-only">
                {s.fields.currency}
              </label>
              <select id={f("currency")} className={inputClass} value={v.value_currency} onChange={(e) => set("value_currency", e.target.value)}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <div>
          <label htmlFor={f("next")} className={labelClass}>
            {s.fields.nextSteps}
            {opt}
          </label>
          <textarea
            id={f("next")}
            className={inputClass}
            rows={2}
            maxLength={2000}
            value={v.next_steps}
            onChange={(e) => set("next_steps", e.target.value)}
          />
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3 min-w-0 border-t border-border pt-4">
        <div>
          <label htmlFor={f("tags")} className={labelClass}>
            {s.fields.tags}
            {opt}
          </label>
          <input
            id={f("tags")}
            className={inputClass}
            maxLength={500}
            autoComplete="off"
            aria-describedby={f("tags-hint")}
            value={v.tags}
            onChange={(e) => set("tags", e.target.value)}
          />
          <p id={f("tags-hint")} className="text-[11.5px] text-ink-muted mt-1">
            {s.fields.tagsHint}
          </p>
        </div>
        <div>
          <label htmlFor={f("division")} className={labelClass}>
            {s.fields.division}
            {opt}
          </label>
          <input
            id={f("division")}
            className={inputClass}
            maxLength={120}
            list={f("divisions")}
            autoComplete="off"
            value={v.division}
            onChange={(e) => set("division", e.target.value)}
          />
          <datalist id={f("divisions")}>
            {divisions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor={f("country")} className={labelClass}>
            {s.fields.country}
            {opt}
          </label>
          <select id={f("country")} className={inputClass} value={v.country_code} onChange={(e) => set("country_code", e.target.value)}>
            <option value="">{s.filters.any}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset className="min-w-0 border-t border-border pt-4">
        <legend className={`${labelClass} pt-4`}>
          {s.fields.members}
          {opt}
        </legend>
        <p className="text-[11.5px] text-ink-muted mb-2">{s.fields.membersHint}</p>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <label htmlFor={f("msearch")} className="sr-only">
            {s.fields.membersSearch}
          </label>
          <input
            id={f("msearch")}
            type="search"
            className={`${inputClass} sm:max-w-[280px]`}
            placeholder={s.fields.membersSearch}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="text-[12px] text-ink-muted" aria-live="polite">
            {fill(s.form.selectedCount, { count: selected.size })}
          </span>
        </div>
        <ul className="max-h-[260px] overflow-y-auto rounded-sm border border-border divide-y divide-border" aria-label={s.fields.members}>
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-[12.5px] text-ink-muted">{s.form.noMembersFound}</li>
          ) : (
            filtered.map((p) => {
              const isOwner = p.id === v.owner_member_id;
              return (
                <li key={p.id}>
                  <label
                    className={`flex items-center gap-3 px-3 py-2 min-h-[44px] text-[13px] ${isOwner ? "opacity-70" : "cursor-pointer hover:bg-page"}`}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[rgb(var(--brand-rgb))]"
                      checked={selected.has(p.id)}
                      disabled={isOwner}
                      onChange={() => toggle(p.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-ink truncate">{nameOf(p)}</span>
                      {p.designation && <span className="block text-[11.5px] text-ink-muted truncate">{p.designation}</span>}
                    </span>
                    {isOwner && <span className="text-[11px] font-bold text-brand-dark">{s.owner}</span>}
                  </label>
                </li>
              );
            })
          )}
        </ul>
      </fieldset>

      {error && <ErrorLine>{error}</ErrorLine>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={primaryButtonClass} disabled={pending}>
          {pending ? s.form.saving : submitLabel}
        </button>
        <Link href={cancelHref} className={secondaryButtonClass}>
          {s.form.cancel}
        </Link>
      </div>
    </form>
  );
}
