"use client";

import { useEffect, useMemo, useState } from "react";
import { CURRENCY_NAMES } from "@/lib/currencyNames";

type Category = "currency" | "length" | "weight" | "temperature" | "volume" | "area" | "data";

// Factors are relative to a base unit per category (meters, kilograms,
// liters, sq meters, bytes). Temperature is handled separately since it's
// not a simple multiplicative conversion. Currency is handled separately
// too, since rates are live and fetched, not fixed factors.
const UNITS: Record<Exclude<Category, "temperature" | "currency">, Record<string, number>> = {
  length: { Meters: 1, Kilometers: 1000, Centimeters: 0.01, Millimeters: 0.001, Miles: 1609.344, Yards: 0.9144, Feet: 0.3048, Inches: 0.0254 },
  weight: { Kilograms: 1, Grams: 0.001, Milligrams: 0.000001, "Metric tons": 1000, Pounds: 0.453592, Ounces: 0.0283495 },
  volume: { Liters: 1, Milliliters: 0.001, "Cubic meters": 1000, Gallons: 3.78541, Quarts: 0.946353, Cups: 0.24 },
  area: { "Square meters": 1, "Square kilometers": 1e6, "Square feet": 0.092903, Acres: 4046.86, Hectares: 10000 },
  data: { Bytes: 1, Kilobytes: 1024, Megabytes: 1024 ** 2, Gigabytes: 1024 ** 3, Terabytes: 1024 ** 4 },
};

const TEMP_UNITS = ["Celsius", "Fahrenheit", "Kelvin"];

function toCelsius(v: number, from: string) {
  if (from === "Celsius") return v;
  if (from === "Fahrenheit") return ((v - 32) * 5) / 9;
  return v - 273.15;
}
function fromCelsius(c: number, to: string) {
  if (to === "Celsius") return c;
  if (to === "Fahrenheit") return (c * 9) / 5 + 32;
  return c + 273.15;
}

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "currency", label: "Currency" },
  { key: "length", label: "Length" },
  { key: "weight", label: "Weight" },
  { key: "temperature", label: "Temperature" },
  { key: "volume", label: "Volume" },
  { key: "area", label: "Area" },
  { key: "data", label: "Data storage" },
];

// Live exchange rates, base USD -- open.er-api.com is free, keyless, and
// CORS-enabled (same "no fake data" standard as the Topbar weather chip:
// if the fetch fails, we show a real error, never a made-up rate).
const RATES_URL = "https://open.er-api.com/v6/latest/USD";

export default function UnitConverter() {
  const [category, setCategory] = useState<Category>("currency");

  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [ratesUpdated, setRatesUpdated] = useState<string | null>(null);

  async function loadRates() {
    setRatesLoading(true);
    setRatesError(null);
    try {
      const res = await fetch(RATES_URL);
      const data = await res.json();
      if (data?.result !== "success" || !data?.rates) throw new Error("Rates unavailable right now.");
      setRates(data.rates);
      setRatesUpdated(data.time_last_update_utc || null);
    } catch {
      setRatesError("Couldn't load live exchange rates. Check your connection and try again.");
    } finally {
      setRatesLoading(false);
    }
  }

  useEffect(() => {
    if (category === "currency" && !rates && !ratesLoading) loadRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const unitNames =
    category === "currency"
      ? rates
        ? Object.keys(rates).sort()
        : []
      : category === "temperature"
        ? TEMP_UNITS
        : Object.keys(UNITS[category]);

  const [fromUnit, setFromUnit] = useState("USD");
  const [toUnit, setToUnit] = useState("EUR");
  const [value, setValue] = useState("1");

  // Once currency rates arrive, make sure From/To point at real codes
  // (USD/EUR by default) rather than sitting on an empty placeholder.
  useEffect(() => {
    if (category === "currency" && rates) {
      if (!rates[fromUnit]) setFromUnit(rates["USD"] ? "USD" : unitNames[0]);
      if (!rates[toUnit]) setToUnit(rates["EUR"] ? "EUR" : unitNames[1] || unitNames[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rates, category]);

  function changeCategory(c: Category) {
    setCategory(c);
    if (c === "currency") {
      setFromUnit(rates?.["USD"] ? "USD" : "USD");
      setToUnit(rates?.["EUR"] ? "EUR" : "EUR");
      return;
    }
    const names = c === "temperature" ? TEMP_UNITS : Object.keys(UNITS[c]);
    setFromUnit(names[0]);
    setToUnit(names[1] || names[0]);
  }

  const result = useMemo(() => {
    const n = parseFloat(value);
    if (isNaN(n)) return "";
    if (category === "currency") {
      if (!rates || !rates[fromUnit] || !rates[toUnit]) return "";
      const usdAmount = n / rates[fromUnit];
      const converted = usdAmount * rates[toUnit];
      return String(Math.round(converted * 10000) / 10000);
    }
    if (category === "temperature") {
      return String(Math.round(fromCelsius(toCelsius(n, fromUnit), toUnit) * 10000) / 10000);
    }
    const factors = UNITS[category];
    const base = n * factors[fromUnit];
    const converted = base / factors[toUnit];
    return String(Math.round(converted * 1e8) / 1e8);
  }, [value, fromUnit, toUnit, category, rates]);

  const selectCls = "border border-border rounded-md px-2.5 py-2 text-[12.5px] bg-surface outline-none focus:border-brand max-w-[160px]";

  function unitLabel(u: string) {
    if (category !== "currency") return u;
    const name = CURRENCY_NAMES[u];
    return name ? `${u} — ${name}` : u;
  }

  const updatedLabel = ratesUpdated
    ? new Date(ratesUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <div className="flex flex-wrap gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            onClick={() => changeCategory(c.key)}
            className={`text-[11.5px] font-semibold px-2.5 py-1.5 rounded-full border ${
              category === c.key ? "bg-brand text-white border-brand" : "border-border text-ink-2 hover:border-brand"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {category === "currency" && ratesLoading && !rates && (
        <div className="text-[13px] text-ink-muted">Loading live exchange rates…</div>
      )}

      {category === "currency" && ratesError && !rates && (
        <div className="bg-critical-wash text-critical text-[12px] rounded-sm px-3 py-2 flex items-center justify-between gap-2">
          <span>{ratesError}</span>
          <button onClick={loadRates} className="font-semibold underline flex-shrink-0">
            Retry
          </button>
        </div>
      )}

      {(category !== "currency" || rates) && (
        <div className="border border-border rounded-lg bg-surface shadow-soft-sm p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">From</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1 min-w-0 border border-border rounded-md px-3 py-2 text-[15px] font-semibold bg-surface outline-none focus:border-brand tabular-nums"
              />
              <select value={fromUnit} onChange={(e) => setFromUnit(e.target.value)} className={selectCls}>
                {unitNames.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => {
              setFromUnit(toUnit);
              setToUnit(fromUnit);
            }}
            className="self-center text-[11px] font-semibold text-brand"
          >
            ⇅ Swap
          </button>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10.5px] font-bold uppercase tracking-wider text-ink-muted">To</label>
            <div className="flex gap-2">
              <div className="flex-1 min-w-0 border border-border rounded-md px-3 py-2 text-[15px] font-bold bg-brand-wash text-brand tabular-nums truncate">
                {result || "—"}
              </div>
              <select value={toUnit} onChange={(e) => setToUnit(e.target.value)} className={selectCls}>
                {unitNames.map((u) => (
                  <option key={u} value={u}>
                    {unitLabel(u)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {category === "currency" && (
            <div className="flex items-center justify-between text-[10.5px] text-ink-muted pt-1">
              <span>
                Live rates via exchangerate-api.com{updatedLabel ? ` · Updated ${updatedLabel}` : ""}
              </span>
              <button onClick={loadRates} disabled={ratesLoading} className="font-semibold text-brand disabled:opacity-50">
                {ratesLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
