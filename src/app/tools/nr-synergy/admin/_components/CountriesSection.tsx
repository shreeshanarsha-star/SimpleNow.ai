"use client";

import { useState } from "react";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { money as ms } from "@/lib/nrs/i18n/en/money";
import { formatMoney, fromMinor, toMinor } from "@/lib/nrs/money";
import { EXPENSE_CATEGORIES } from "@/lib/nrs/invoice/types";
import type { CountryDto, CountryRuleDto, HolidayDto } from "@/lib/nrs/invoice/adminTypes";
import { Button, Card, Empty, ErrorBox, Field, Loading, Notice, SectionTitle, api, errorText, fmt, inputCls, todayIso, useLoad } from "../../money/_components/ui";

interface CountriesData {
  year: string;
  countries: CountryDto[];
  rules: CountryRuleDto[];
  holidays: HolidayDto[];
}

function CountryForm({ initial, onSaved, onCancel }: { initial: CountryDto | null; onSaved: () => void; onCancel: () => void }) {
  const [c, setC] = useState<CountryDto>(initial ?? { code: "", name: "", timezone: "", currency: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/api/nr-synergy/admin/countries", { method: "POST", body: JSON.stringify(c) });
      onSaved();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={s.countries.code} hint={s.countries.codeHint}>
            {(id, h) => (
              <input id={id} aria-describedby={h} required maxLength={2} disabled={!!initial} className={inputCls} value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} />
            )}
          </Field>
          <Field label={s.countries.name}>
            {(id) => <input id={id} required className={inputCls} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />}
          </Field>
          <Field label={s.countries.timezone} hint={s.countries.timezoneHint}>
            {(id, h) => <input id={id} aria-describedby={h} required className={inputCls} value={c.timezone} onChange={(e) => setC({ ...c, timezone: e.target.value })} />}
          </Field>
          <Field label={s.countries.currency} hint={s.countries.currencyHint}>
            {(id, h) => (
              <input id={id} aria-describedby={h} required maxLength={3} className={inputCls} value={c.currency} onChange={(e) => setC({ ...c, currency: e.target.value.toUpperCase() })} />
            )}
          </Field>
        </div>
        {error && <ErrorBox message={error} />}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {s.common.cancel}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {s.common.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function RuleForm({ country, latest, onSaved, onCancel }: { country: CountryDto; latest: CountryRuleDto | null; onSaved: () => void; onCancel: () => void }) {
  const [from, setFrom] = useState(todayIso());
  const [days, setDays] = useState<number[]>(latest?.working_days ?? [1, 2, 3, 4, 5]);
  const [hours, setHours] = useState(latest?.std_hours_per_day ?? "8");
  const [limits, setLimits] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of EXPENSE_CATEGORIES) {
      const v = latest?.expense_limits[k];
      out[k] = typeof v === "number" ? fromMinor(v, country.currency) : "";
    }
    return out;
  });
  const [leave, setLeave] = useState(JSON.stringify(latest?.leave_rules ?? {}, null, 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    let leaveRules: unknown;
    try {
      leaveRules = leave.trim() ? JSON.parse(leave) : {};
    } catch {
      return setError(s.countries.invalidJson);
    }
    const expenseLimits: Record<string, number> = {};
    for (const [k, v] of Object.entries(limits)) {
      if (!v.trim()) continue;
      try {
        expenseLimits[k] = toMinor(v, country.currency);
      } catch {
        return setError(`${ms.categories[k as keyof typeof ms.categories]}: not a number`);
      }
    }
    setBusy(true);
    try {
      await api("/api/nr-synergy/admin/countries/rules", {
        method: "POST",
        body: JSON.stringify({
          country_code: country.code,
          effective_from: from,
          working_days: days,
          std_hours_per_day: hours,
          leave_rules: leaveRules,
          expense_limits: expenseLimits,
        }),
      });
      onSaved();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={s.countries.effectiveFrom}>
          {(id) => <input id={id} type="date" required className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
        <Field label={s.countries.stdHours}>
          {(id) => <input id={id} inputMode="decimal" required className={inputCls} value={hours} onChange={(e) => setHours(e.target.value)} />}
        </Field>
      </div>
      <fieldset>
        <legend className="text-[12px] font-bold text-ink-2 mb-1">{s.countries.workingDays}</legend>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <label key={d} className="inline-flex items-center gap-1 text-[12.5px] text-ink-2">
              <input
                type="checkbox"
                checked={days.includes(d)}
                onChange={(e) => setDays(e.target.checked ? [...days, d].sort() : days.filter((x) => x !== d))}
              />
              {s.countries.weekdays[String(d) as keyof typeof s.countries.weekdays]}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-[12px] font-bold text-ink-2">{fmt(s.countries.expenseLimits, { currency: country.currency })}</legend>
        <p className="text-[11.5px] text-ink-muted mb-1">{s.countries.expenseLimitsHint}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {EXPENSE_CATEGORIES.map((k) => (
            <Field key={k} label={ms.categories[k]}>
              {(id) => (
                <input id={id} inputMode="decimal" className={inputCls} value={limits[k]} onChange={(e) => setLimits({ ...limits, [k]: e.target.value })} />
              )}
            </Field>
          ))}
        </div>
      </fieldset>
      <Field label={s.countries.leaveRules} hint={s.countries.leaveRulesHint}>
        {(id, h) => <textarea id={id} aria-describedby={h} rows={2} className={`${inputCls} font-mono text-[12px]`} value={leave} onChange={(e) => setLeave(e.target.value)} />}
      </Field>
      {error && <ErrorBox message={error} />}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {s.common.cancel}
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          {s.common.save}
        </Button>
      </div>
    </form>
  );
}

function CountryDetail({ country, data, year, setYear, reload }: { country: CountryDto; data: CountriesData; year: string; setYear: (y: string) => void; reload: () => Promise<void> }) {
  const rules = data.rules.filter((r) => r.country_code === country.code);
  const holidays = data.holidays.filter((h) => h.country_code === country.code);
  const [addingRule, setAddingRule] = useState(false);
  const [day, setDay] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addHoliday = async () => {
    setBusy("add");
    setError(null);
    try {
      await api("/api/nr-synergy/admin/countries/holidays", { method: "POST", body: JSON.stringify({ country_code: country.code, day, name }) });
      setDay("");
      setName("");
      await reload();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };
  const removeHoliday = async (h: HolidayDto) => {
    setBusy(h.id);
    setError(null);
    try {
      await api(`/api/nr-synergy/admin/countries/holidays?id=${h.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <SectionTitle
          title={s.countries.rules}
          action={
            !addingRule && (
              <Button onClick={() => setAddingRule(true)}>{s.countries.addRule}</Button>
            )
          }
        />
        {addingRule && (
          <RuleForm
            country={country}
            latest={rules[0] ?? null}
            onCancel={() => setAddingRule(false)}
            onSaved={() => {
              setAddingRule(false);
              void reload();
            }}
          />
        )}
        {!rules.length ? (
          <p className="text-[12.5px] text-ink-muted">{s.countries.rulesEmpty}</p>
        ) : (
          <ul className="flex flex-col gap-2 mt-2">
            {rules.map((r) => (
              <li key={r.id} className="rounded-md bg-page px-3 py-2 text-[12.5px] text-ink-2">
                <p className="font-bold text-ink">
                  {s.countries.effectiveFrom}: {r.effective_from}
                </p>
                <p>
                  {r.working_days.map((d) => s.countries.weekdays[String(d) as keyof typeof s.countries.weekdays]).join(", ")} · {r.std_hours_per_day}h
                </p>
                <p className="break-words">
                  {Object.entries(r.expense_limits)
                    .filter(([, v]) => typeof v === "number")
                    .map(([k, v]) => `${ms.categories[k as keyof typeof ms.categories] ?? k}: ${formatMoney(v as number, country.currency)}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle
          title={fmt(s.countries.holidays, { year })}
          action={
            <Field label={s.countries.year} className="w-[110px]">
              {(id) => (
                <select id={id} className={inputCls} value={year} onChange={(e) => setYear(e.target.value)}>
                  {[0, 1, 2].map((o) => {
                    const y = String(new Date().getFullYear() - 1 + o);
                    return (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    );
                  })}
                </select>
              )}
            </Field>
          }
        />
        {error && <ErrorBox message={error} />}
        {!holidays.length ? (
          <p className="text-[12.5px] text-ink-muted mb-3">{s.countries.holidaysEmpty}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border mb-3">
            {holidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 py-1.5 text-[12.5px]">
                <span className="tabular-nums text-ink-2 w-[92px] shrink-0">{h.day}</span>
                <span className="flex-1 min-w-0 text-ink break-words">{h.name}</span>
                <Button variant="ghost" busy={busy === h.id} onClick={() => void removeHoliday(h)} aria-label={`${s.common.delete} ${h.name}`}>
                  {s.common.delete}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void addHoliday();
          }}
        >
          <Field label={s.countries.day} className="w-[160px]">
            {(id) => <input id={id} type="date" required className={inputCls} value={day} onChange={(e) => setDay(e.target.value)} />}
          </Field>
          <Field label={s.countries.holidayName} className="flex-1 min-w-[180px]">
            {(id) => <input id={id} required maxLength={120} className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <Button type="submit" variant="primary" busy={busy === "add"}>
            {s.countries.addHoliday}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function CountriesSection() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const data = useLoad(() => api<CountriesData>(`/api/nr-synergy/admin/countries?year=${year}`), [year]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<CountryDto | "new" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (data.loading && !data.data) return <Loading label={s.common.loading} />;
  if (data.error || !data.data) return <ErrorBox message={data.error ?? s.common.error} onRetry={data.reload} retryLabel={s.common.retry} />;
  const d = data.data;
  const country = d.countries.find((c) => c.code === selected) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title={s.sections.countries}
        action={
          !form && (
            <Button variant="primary" onClick={() => setForm("new")}>
              {s.countries.add}
            </Button>
          )
        }
      />
      {notice && <Notice message={notice} />}
      {form && (
        <CountryForm
          initial={form === "new" ? null : form}
          onCancel={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            setNotice(s.common.saved);
            void data.reload();
          }}
        />
      )}
      {!d.countries.length ? (
        <Card>
          <Empty title={s.countries.emptyTitle} body={s.countries.emptyBody} />
        </Card>
      ) : (
        <>
          <ul className="flex flex-wrap gap-2" aria-label={s.sections.countries}>
            {d.countries.map((c) => (
              <li key={c.code}>
                <Button variant={selected === c.code ? "primary" : "secondary"} aria-pressed={selected === c.code} onClick={() => setSelected(c.code)}>
                  {c.name} ({c.code})
                </Button>
              </li>
            ))}
          </ul>
          {country ? (
            <>
              <Card className="!p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-ink-2">
                  <span>
                    <strong className="text-ink">{country.name}</strong> · {country.timezone} · {country.currency}
                  </span>
                  <Button variant="ghost" onClick={() => setForm(country)}>
                    {s.common.edit}
                  </Button>
                </div>
              </Card>
              <CountryDetail country={country} data={d} year={year} setYear={setYear} reload={data.reload} />
            </>
          ) : (
            <p className="text-[12.5px] text-ink-muted">{s.countries.select}</p>
          )}
        </>
      )}
    </div>
  );
}
