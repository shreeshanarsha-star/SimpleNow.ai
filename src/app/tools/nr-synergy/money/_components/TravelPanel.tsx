"use client";

import { useMemo, useState } from "react";
import { money as s } from "@/lib/nrs/i18n/en/money";
import { formatMoney } from "@/lib/nrs/money";
import type { MoneyProfileDto, TravelDto } from "@/lib/nrs/invoice/types";
import {
  Badge,
  Button,
  COMMON_CURRENCIES,
  Card,
  Empty,
  ErrorBox,
  Field,
  Loading,
  Notice,
  SectionTitle,
  api,
  errorText,
  fmt,
  inputCls,
  todayIso,
  useLoad,
} from "./ui";

function days(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

function TravelForm({ profile, onDone, onCancel }: { profile: MoneyProfileDto; onDone: (t: TravelDto) => void; onCancel: () => void }) {
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [startsOn, setStartsOn] = useState(todayIso());
  const [endsOn, setEndsOn] = useState(todayIso());
  const [estimated, setEstimated] = useState("");
  const [currency, setCurrency] = useState(profile.countryCurrency);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currencies = useMemo(
    () => Array.from(new Set([profile.countryCurrency, profile.reportingCurrency, ...COMMON_CURRENCIES])),
    [profile.countryCurrency, profile.reportingCurrency]
  );

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const { travel } = await api<{ travel: TravelDto }>("/api/nr-synergy/money/travel", {
        method: "POST",
        body: JSON.stringify({
          destination,
          purpose,
          starts_on: startsOn,
          ends_on: endsOn,
          estimated: estimated.trim() || null,
          currency: estimated.trim() ? currency : null,
        }),
      });
      onDone(travel);
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
          void submit();
        }}
      >
        <h3 className="text-[14px] font-bold text-ink">{s.travel.formTitle}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={s.travel.destination} hint={s.travel.destinationHint} className="sm:col-span-2">
            {(id, d) => <input id={id} aria-describedby={d} required maxLength={200} className={inputCls} value={destination} onChange={(e) => setDestination(e.target.value)} />}
          </Field>
          <Field label={s.travel.purpose} className="sm:col-span-2">
            {(id) => <textarea id={id} required rows={3} maxLength={1000} className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} />}
          </Field>
          <Field label={s.travel.startsOn}>
            {(id) => (
              <input
                id={id}
                type="date"
                required
                className={inputCls}
                value={startsOn}
                onChange={(e) => {
                  setStartsOn(e.target.value);
                  if (endsOn < e.target.value) setEndsOn(e.target.value);
                }}
              />
            )}
          </Field>
          <Field label={s.travel.endsOn}>
            {(id) => <input id={id} type="date" required min={startsOn} className={inputCls} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />}
          </Field>
          <Field label={`${s.travel.estimated} (${s.common.optional})`}>
            {(id) => <input id={id} inputMode="decimal" autoComplete="off" placeholder="0.00" className={inputCls} value={estimated} onChange={(e) => setEstimated(e.target.value)} />}
          </Field>
          <Field label={s.travel.currency}>
            {(id) => (
              <select id={id} className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        {error && <ErrorBox message={error} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {s.common.cancel}
          </Button>
          <Button type="submit" variant="primary" busy={busy}>
            {s.travel.submit}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function TravelPanel({ profile }: { profile: MoneyProfileDto }) {
  const list = useLoad(() => api<{ travel: TravelDto[] }>("/api/nr-synergy/money/travel"), []);
  const [showForm, setShowForm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle
        title={s.tabs.travel}
        action={
          !showForm && (
            <Button variant="primary" onClick={() => setShowForm(true)}>
              {s.travel.new}
            </Button>
          )
        }
      />
      {notice && <Notice message={notice} />}
      {showForm && (
        <TravelForm
          profile={profile}
          onCancel={() => setShowForm(false)}
          onDone={(t) => {
            list.setData((d) => ({ travel: [t, ...(d?.travel ?? [])] }));
            setShowForm(false);
            setNotice(s.travel.submitted);
          }}
        />
      )}
      {list.loading && !list.data ? (
        <Loading label={s.common.loading} />
      ) : list.error ? (
        <ErrorBox message={list.error} onRetry={list.reload} retryLabel={s.common.retry} />
      ) : !list.data?.travel.length ? (
        <Card>
          <Empty title={s.travel.emptyTitle} body={s.travel.emptyBody} />
        </Card>
      ) : (
        <ul aria-label={s.travel.listLabel} className="flex flex-col gap-2">
          {list.data.travel.map((t) => (
            <li key={t.id}>
              <Card className="!p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-ink break-words">{t.destination}</p>
                    <p className="text-[12px] text-ink-muted">
                      {t.starts_on} → {t.ends_on} · {fmt(s.travel.nights, { n: days(t.starts_on, t.ends_on) })}
                    </p>
                    <p className="text-[12px] text-ink-2 mt-1 break-words">{t.purpose}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge tone={t.status}>{s.status[t.status]}</Badge>
                    {t.estimated_minor != null && t.currency && (
                      <span className="text-[12.5px] font-bold text-ink tabular-nums">{formatMoney(t.estimated_minor, t.currency)}</span>
                    )}
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
