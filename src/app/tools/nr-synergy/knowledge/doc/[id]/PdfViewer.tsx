"use client";

import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { ErrorLine, secondaryButtonClass } from "../../../_home/ui";
import { viewer as s } from "../../_viewerStrings";

type State = { status: "loading" } | { status: "ready"; url: string } | { status: "error"; message: string };

async function fetchUrl(versionId: string, download: boolean): Promise<string> {
  const res = await fetch(`/api/nr-synergy/knowledge/file?version_id=${versionId}${download ? "&download=1" : ""}`, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !body?.url) throw new Error(body?.error || s.error);
  return body.url;
}

// Inline PDF for a policy version. The signed link lasts 10 minutes; the
// page already showing the PDF keeps working, and Open / Download always
// fetch a fresh link.
export default function PdfViewer({ versionId, title }: { versionId: string; title: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      setState({ status: "ready", url: await fetchUrl(versionId, false) });
    } catch (e) {
      setState({ status: "error", message: e instanceof Error ? e.message : s.error });
    }
  }, [versionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (kind: "open" | "download") => {
    setBusy(kind);
    setActionError(null);
    // Open the tab synchronously so pop-up blockers allow it.
    const win = kind === "open" ? window.open("", "_blank") : null;
    if (win) win.opener = null;
    try {
      const url = await fetchUrl(versionId, kind === "download");
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      setActionError(e instanceof Error ? e.message : s.error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label={s.label} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-[12px] font-bold text-ink-2">
          <Icon name="book" className="w-4 h-4 text-brand" />
          {s.label}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className={secondaryButtonClass} disabled={!!busy} aria-busy={busy === "open" || undefined} onClick={() => void act("open")}>
            <Icon name="externalLink" className="w-3.5 h-3.5" />
            {s.open}
          </button>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={!!busy}
            aria-busy={busy === "download" || undefined}
            onClick={() => void act("download")}
          >
            <Icon name="download" className="w-3.5 h-3.5" />
            {busy === "download" ? s.preparing : s.download}
          </button>
        </div>
      </div>
      {actionError && <ErrorLine>{actionError}</ErrorLine>}

      <div className="relative overflow-hidden rounded-md border border-border bg-page">
        {state.status === "loading" && (
          <div role="status" className="flex h-[60vh] min-h-[360px] flex-col items-center justify-center gap-2 text-[12.5px] text-ink-muted">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
            {s.loading}
          </div>
        )}
        {state.status === "error" && (
          <div role="alert" className="flex h-[40vh] min-h-[240px] flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-[13px] font-bold text-ink">{s.errorTitle}</p>
            <p className="text-[12.5px] text-ink-muted max-w-[360px]">{state.message}</p>
            <button type="button" className={secondaryButtonClass} onClick={() => void load()}>
              {s.retry}
            </button>
          </div>
        )}
        {state.status === "ready" && (
          <iframe
            src={`${state.url}#view=FitH`}
            title={`${title} (PDF)`}
            className="block h-[60vh] min-h-[360px] w-full sm:h-[75vh] bg-white"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
      <p className="text-[11.5px] text-ink-muted">{s.hint}</p>
    </section>
  );
}
