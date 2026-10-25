"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { api, areaCls, Btn, Card, Empty, Field, inputCls, canAdmin, type Role } from "./ui";

type Product = {
  id?: string;
  name: string;
  sku?: string | null;
  category?: string | null;
  summary?: string | null;
  key_benefits?: string[];
  species?: string[];
  applications?: string[];
  dosage?: string | null;
  pack_sizes?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  currency?: string;
  price_unit?: string | null;
  countries?: string[];
  active?: boolean;
  sort?: number;
};

const list = (v: unknown) => (Array.isArray(v) ? v.join(", ") : String(v || ""));

function ProductForm({ initial, onCancel, onSave }: { initial: Product; onCancel: () => void; onSave: (p: Product) => Promise<void> }) {
  const [p, setP] = useState<Record<string, unknown>>({ currency: "INR", active: true, ...initial, key_benefits: (initial.key_benefits || []).join("\n") });
  const [busy, setBusy] = useState(false);
  const s = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setP((x) => ({ ...x, [k]: e.target.value }));
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-surface rounded-2xl shadow-soft w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="font-bold">{initial.id ? "Edit product" : "Add product"}</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Name *"><input className={inputCls} value={String(p.name || "")} onChange={s("name")} /></Field>
          <Field label="SKU / code"><input className={inputCls} value={String(p.sku || "")} onChange={s("sku")} /></Field>
          <Field label="Category"><input className={inputCls} value={String(p.category || "")} onChange={s("category")} /></Field>
        </div>
        <Field label="Summary"><textarea rows={2} className={areaCls} value={String(p.summary || "")} onChange={s("summary")} /></Field>
        <Field label="Key benefits (one per line — include proof numbers where you have them)"><textarea rows={4} className={areaCls} value={String(p.key_benefits || "")} onChange={s("key_benefits")} /></Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Species / segments (comma separated)"><input className={inputCls} value={list(p.species)} onChange={s("species")} /></Field>
          <Field label="Applications (comma separated)"><input className={inputCls} value={list(p.applications)} onChange={s("applications")} /></Field>
        </div>
        <Field label="Dosage / usage (exactly as on the label)"><textarea rows={2} className={areaCls} value={String(p.dosage || "")} onChange={s("dosage")} /></Field>
        <div className="grid sm:grid-cols-5 gap-3">
          <Field label="Pack sizes"><input className={inputCls} value={String(p.pack_sizes || "")} onChange={s("pack_sizes")} /></Field>
          <Field label="Price from"><input type="number" className={inputCls} value={String(p.price_min ?? "")} onChange={s("price_min")} /></Field>
          <Field label="Price to"><input type="number" className={inputCls} value={String(p.price_max ?? "")} onChange={s("price_max")} /></Field>
          <Field label="Currency"><input className={inputCls} value={String(p.currency || "")} onChange={s("currency")} /></Field>
          <Field label="Per"><input className={inputCls} placeholder="kg, litre, pack" value={String(p.price_unit || "")} onChange={s("price_unit")} /></Field>
        </div>
        <Field label="Registered / available in (countries, comma separated)" hint="Dr.Remi won't promise availability elsewhere"><input className={inputCls} value={list(p.countries)} onChange={s("countries")} /></Field>
        <label className="text-[12px] flex items-center gap-1.5"><input type="checkbox" checked={p.active !== false} onChange={(e) => setP((x) => ({ ...x, active: e.target.checked }))} /> Show to customers</label>
        <div className="flex justify-end gap-2">
          <Btn onClick={onCancel}>Cancel</Btn>
          <Btn
            variant="primary"
            disabled={busy || !String(p.name || "").trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave({ ...(p as unknown as Product), key_benefits: String(p.key_benefits || "").split("\n").map((x) => x.trim()).filter(Boolean) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function ProductsTab({ wsId, role, extractFrom, clearExtract }: { wsId: string; role: Role; extractFrom: string | null; clearExtract: () => void }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [drafts, setDrafts] = useState<(Product & { _keep: boolean })[] | null>(null);
  const [extracting, setExtracting] = useState(false);
  const admin = canAdmin(role);

  const load = useCallback(() => {
    api<{ products: Product[] }>(`/api/remi/w/${wsId}/products`).then((d) => setProducts(d.products)).catch(() => setProducts([]));
  }, [wsId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!extractFrom) return;
    setExtracting(true);
    api<{ drafts: Product[] }>(`/api/remi/w/${wsId}/products`, { method: "POST", json: { extract_from: extractFrom } })
      .then((d) => setDrafts(d.drafts.map((x) => ({ ...x, _keep: true }))))
      .catch((e) => alert(e.message))
      .finally(() => {
        setExtracting(false);
        clearExtract();
      });
  }, [extractFrom, wsId, clearExtract]);

  async function save(p: Product) {
    if (p.id) await api(`/api/remi/w/${wsId}/products/${p.id}`, { method: "PATCH", json: p });
    else await api(`/api/remi/w/${wsId}/products`, { method: "POST", json: p });
    setEditing(null);
    load();
  }

  async function saveDrafts() {
    const keep = (drafts || []).filter((d) => d._keep).map(({ _keep, ...d }) => (void _keep, d));
    if (keep.length) await api(`/api/remi/w/${wsId}/products`, { method: "POST", json: { products: keep } });
    setDrafts(null);
    load();
  }

  async function remove(p: Product) {
    if (!confirm(`Delete ${p.name}?`)) return;
    await api(`/api/remi/w/${wsId}/products/${p.id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      {extracting && <Card><div className="text-[12.5px] text-brand font-semibold">Reading the source and drafting product cards…</div></Card>}
      {drafts && (
        <Card title={`Review ${drafts.length} drafted products`} icon="sparkle" action={<div className="flex gap-2"><Btn onClick={() => setDrafts(null)}>Discard</Btn><Btn variant="primary" onClick={saveDrafts}>Add selected</Btn></div>}>
          <ul className="divide-y divide-border">
            {drafts.map((d, i) => (
              <li key={i} className="py-2 flex gap-3 items-start text-[12px]">
                <input type="checkbox" className="mt-1" checked={d._keep} onChange={(e) => setDrafts((all) => all!.map((x, j) => (j === i ? { ...x, _keep: e.target.checked } : x)))} />
                <div>
                  <div className="font-semibold">{d.name} {d.category ? <span className="text-ink-muted font-normal">· {d.category}</span> : null}</div>
                  <div className="text-ink-2">{d.summary}</div>
                  {!!d.key_benefits?.length && <div className="text-ink-muted">{d.key_benefits.join(" · ")}</div>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card
        title={`Product catalog (${products?.length || 0})`}
        icon="box"
        action={admin ? <Btn variant="primary" onClick={() => setEditing({ name: "" })}><Icon name="tag" className="w-3.5 h-3.5" /> Add product</Btn> : null}
      >
        <p className="text-[11.5px] text-ink-muted mb-3">
          Structured product cards power recommendations, the product shelf on your public page and price ranges. Tip: upload your catalogue in Brains, then click the <Icon name="box" className="w-3 h-3 inline" /> button on it to draft these automatically.
        </p>
        {!products ? (
          <div className="text-sm text-ink-muted">Loading…</div>
        ) : !products.length ? (
          <Empty icon="box" title="No products yet">Add products manually or extract them from an uploaded catalogue.</Empty>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {products.map((p) => (
              <div key={p.id} className={`border border-border rounded-xl p-3 bg-page ${p.active === false ? "opacity-60" : ""}`}>
                <div className="flex justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[12.5px]">{p.name}{p.sku ? <span className="text-ink-muted font-normal"> · {p.sku}</span> : null}</div>
                    <div className="text-[11px] text-ink-muted">{[p.category, (p.species || []).join(", ")].filter(Boolean).join(" · ")}</div>
                  </div>
                  {admin && (
                    <div className="flex gap-1">
                      <Btn onClick={() => setEditing(p)}><Icon name="edit" className="w-3.5 h-3.5" /></Btn>
                      <Btn variant="danger" onClick={() => remove(p)}><Icon name="trash" className="w-3.5 h-3.5" /></Btn>
                    </div>
                  )}
                </div>
                {p.summary && <p className="text-[11.5px] text-ink-2 mt-1 line-clamp-2">{p.summary}</p>}
                <div className="text-[11px] text-ink-muted mt-1">
                  {p.price_min != null || p.price_max != null ? `${p.currency} ${p.price_min ?? ""}${p.price_max != null && p.price_max !== p.price_min ? `–${p.price_max}` : ""}${p.price_unit ? `/${p.price_unit}` : ""}` : "No price"}
                  {p.countries?.length ? ` · ${p.countries.join(", ")}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {editing && <ProductForm initial={editing} onCancel={() => setEditing(null)} onSave={save} />}
    </div>
  );
}
