"use client";

// Dr.Remi.ai admin console (SimpleNow > Personal Tools > Dr.Remi.ai).
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Icon from "@/components/Icon";
import RemiAvatar from "./RemiAvatar";
import DashboardTab from "./console/DashboardTab";
import LeadsTab from "./console/LeadsTab";
import ConversationsTab from "./console/ConversationsTab";
import BrainsTab from "./console/BrainsTab";
import ProductsTab from "./console/ProductsTab";
import ShareTab from "./console/ShareTab";
import SettingsTab from "./console/SettingsTab";
import { api, areaCls, Btn, Card, Field, inputCls, canAdmin, type Role } from "./console/ui";

type WsListItem = { id: string; slug: string; name: string; assistant_name: string; role: Role; active: boolean };
type WS = Record<string, unknown> & { id: string; slug: string; name: string; active: boolean; assistant_name: string };

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: "chart" },
  { id: "leads", label: "Leads", icon: "target" },
  { id: "conversations", label: "Conversations", icon: "chat", hideFor: ["rep"] },
  { id: "brains", label: "Brains", icon: "brain" },
  { id: "products", label: "Products", icon: "box" },
  { id: "share", label: "Test & Share", icon: "mic" },
  { id: "settings", label: "Settings & Team", icon: "gear" },
];

function CreateWorkspace({ onCreated, first }: { onCreated: (w: WsListItem) => void; first: boolean }) {
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [about, setAbout] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card className="max-w-2xl mx-auto">
      <div className="flex items-center gap-4 pt-4">
        <RemiAvatar size={64} />
        <div>
          <h2 className="text-lg font-bold">{first ? "Meet Dr.Remi — your 24/7 multilingual sales assistant" : "New Dr.Remi workspace"}</h2>
          <p className="text-[12.5px] text-ink-muted">Talks to customers in any language, answers from your approved product knowledge, qualifies leads and emails your team.</p>
        </div>
      </div>
      <div className="space-y-3 mt-4">
        <Field label="Company or brand name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Natural Remedies — Avicare" /></Field>
        <Field label="Industry"><input className={inputCls} value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="e.g. Poultry health & nutrition" /></Field>
        <Field label="About (optional)" hint="Who you sell to, what makes you different, where you operate"><textarea rows={3} className={areaCls} value={about} onChange={(e) => setAbout(e.target.value)} /></Field>
        {err && <div className="text-[12px] text-critical">{err}</div>}
        <div className="flex justify-end">
          <Btn
            variant="primary"
            disabled={busy || name.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              try {
                const r = await api<{ workspace: WsListItem }>("/api/remi/workspaces", { method: "POST", json: { name, industry, about } });
                onCreated(r.workspace);
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Creating…" : "Create my assistant"}
          </Btn>
        </div>
      </div>
    </Card>
  );
}

export default function RemiConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [list, setList] = useState<WsListItem[] | null>(null);
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  const [wsId, setWsId] = useState<string | null>(sp.get("ws"));
  const [ws, setWs] = useState<WS | null>(null);
  const [role, setRole] = useState<Role>("viewer");
  const [tab, setTab] = useState(sp.get("lead") ? "leads" : sp.get("tab") || "dashboard");
  const [openLeadId, setOpenLeadId] = useState<string | null>(sp.get("lead"));
  const [creating, setCreating] = useState(false);
  const [extractFrom, setExtractFrom] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    try {
      const r = await api<{ workspaces: WsListItem[]; me: { id: string; email: string } }>("/api/remi/workspaces");
      setList(r.workspaces);
      setMe(r.me);
      setWsId((cur) => (cur && r.workspaces.some((w) => w.id === cur) ? cur : r.workspaces[0]?.id || null));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, []);
  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!wsId) return;
    setWs(null);
    api<{ workspace: WS; role: Role }>(`/api/remi/w/${wsId}`)
      .then((r) => {
        setWs(r.workspace);
        setRole(r.role);
      })
      .catch((e) => setErr(e.message));
  }, [wsId]);

  useEffect(() => {
    if (!wsId) return;
    const q = new URLSearchParams({ ws: wsId, tab });
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }, [wsId, tab, router, pathname]);

  const clearExtract = useCallback(() => setExtractFrom(null), []);

  if (err) return <Card><div className="text-critical text-sm p-2">{err}</div></Card>;
  if (!list) return <div className="text-sm text-ink-muted p-6">Loading Dr.Remi…</div>;
  if (!list.length || creating) {
    return (
      <div className="space-y-3">
        {creating && <Btn onClick={() => setCreating(false)}><Icon name="chevronLeft" className="w-3.5 h-3.5" /> Back</Btn>}
        <CreateWorkspace
          first={!list.length}
          onCreated={(w) => {
            setCreating(false);
            setList((l) => [...(l || []), w]);
            setWsId(w.id);
            setTab("brains");
          }}
        />
      </div>
    );
  }

  const tabs = TABS.filter((t) => !t.hideFor?.includes(role));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <RemiAvatar size={44} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {list.length > 1 ? (
                <select value={wsId || ""} onChange={(e) => setWsId(e.target.value)} className="font-bold text-[15px] bg-transparent outline-none cursor-pointer">
                  {list.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              ) : (
                <span className="font-bold text-[15px] truncate">{ws?.name || list[0].name}</span>
              )}
              {ws && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${ws.active ? "bg-good-wash text-good-text border-good/30" : "bg-page text-ink-muted border-border"}`}>
                  {ws.active ? "● LIVE" : "OFF"}
                </span>
              )}
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-brand-wash text-brand">{role}</span>
            </div>
            {ws && (
              <a href={`/remi/${ws.slug}`} target="_blank" rel="noreferrer" className="text-[11.5px] text-brand hover:underline inline-flex items-center gap-1">
                simplenow.ai/remi/{ws.slug} <Icon name="externalLink" className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {ws && <a href={`/remi/${ws.slug}?mode=kiosk`} target="_blank" rel="noreferrer"><Btn variant="soft"><Icon name="maximize" className="w-3.5 h-3.5" /> Kiosk</Btn></a>}
          <Btn onClick={() => setCreating(true)}><Icon name="sparkle" className="w-3.5 h-3.5" /> New workspace</Btn>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-border -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`h-9 px-3 text-[12.5px] font-semibold flex items-center gap-1.5 border-b-2 whitespace-nowrap transition-colors ${tab === t.id ? "border-brand text-brand" : "border-transparent text-ink-muted hover:text-ink"}`}
          >
            <Icon name={t.icon} className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </nav>

      {!ws || !wsId ? (
        <div className="text-sm text-ink-muted p-6">Loading…</div>
      ) : tab === "dashboard" ? (
        <DashboardTab wsId={wsId} role={role} openLead={(id) => { setOpenLeadId(id); setTab("leads"); }} goTab={setTab} />
      ) : tab === "leads" ? (
        <LeadsTab wsId={wsId} role={role} meId={me?.id || ""} openLeadId={openLeadId} setOpenLeadId={setOpenLeadId} />
      ) : tab === "conversations" ? (
        <ConversationsTab wsId={wsId} openLead={(id) => { setOpenLeadId(id); setTab("leads"); }} />
      ) : tab === "brains" ? (
        <BrainsTab wsId={wsId} role={role} onExtractProducts={(id) => { setExtractFrom(id); setTab("products"); }} />
      ) : tab === "products" ? (
        <ProductsTab wsId={wsId} role={role} extractFrom={canAdmin(role) ? extractFrom : null} clearExtract={clearExtract} />
      ) : tab === "share" ? (
        <ShareTab slug={ws.slug} active={ws.active} />
      ) : (
        <SettingsTab
          ws={ws}
          role={role}
          meId={me?.id || ""}
          onSaved={(w) => {
            setWs(w as WS);
            setList((l) => (l || []).map((x) => (x.id === w.id ? { ...x, name: w.name, slug: w.slug, active: w.active } : x)));
          }}
          onDeleted={() => {
            setWsId(null);
            setWs(null);
            loadList();
          }}
        />
      )}
    </div>
  );
}
