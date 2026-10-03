"use client";

import { useState } from "react";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { Button, Card, ConfirmDialog, ErrorBox, Loading, Notice, SectionTitle, api, errorText, fmt, useLoad } from "../../money/_components/ui";

function summary(counts: Record<string, number>): string {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${t.replace(/^nrs_/, "").replace(/_/g, " ")}`);
  return parts.length ? parts.join(", ") : "0";
}

export default function DemoSection() {
  const status = useLoad(() => api<{ loaded: boolean }>("/api/nr-synergy/admin/demo"), []);
  const [busy, setBusy] = useState<"load" | "wipe" | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy("load");
    setError(null);
    setNotice(null);
    try {
      const { counts } = await api<{ counts: Record<string, number> }>("/api/nr-synergy/admin/demo", { method: "POST" });
      setNotice(fmt(s.demo.loaded, { summary: summary(counts) }));
      status.setData({ loaded: true });
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(null);
    }
  };

  const wipe = async () => {
    setBusy("wipe");
    setError(null);
    setNotice(null);
    try {
      const { counts } = await api<{ counts: Record<string, number> }>("/api/nr-synergy/admin/demo", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "WIPE" }),
      });
      setNotice(fmt(s.demo.wiped, { summary: summary(counts) }));
      status.setData({ loaded: false });
      setConfirm(false);
    } catch (e) {
      setError(errorText(e, s.common.error));
      setConfirm(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle title={s.sections.demo} body={s.demo.intro} />
      <Card>
        {status.loading && !status.data ? (
          <Loading label={s.common.loading} />
        ) : status.error ? (
          <ErrorBox message={status.error} onRetry={status.reload} retryLabel={s.common.retry} />
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-ink">{status.data?.loaded ? s.demo.statusLoaded : s.demo.statusEmpty}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" busy={busy === "load"} disabled={!!busy || !!status.data?.loaded} onClick={() => void load()}>
                {busy === "load" ? s.demo.loading : s.demo.load}
              </Button>
              <Button variant="danger" disabled={!!busy} onClick={() => setConfirm(true)}>
                {s.demo.wipe}
              </Button>
            </div>
          </div>
        )}
      </Card>
      {notice && <Notice message={notice} />}
      {error && <ErrorBox message={error} />}
      <ConfirmDialog
        open={confirm}
        title={s.demo.confirmTitle}
        body={s.demo.confirmBody}
        confirmLabel={busy === "wipe" ? s.demo.wiping : s.demo.wipe}
        cancelLabel={s.common.cancel}
        danger
        busy={busy === "wipe"}
        requireText="WIPE"
        requireLabel={s.demo.confirmType}
        onConfirm={() => void wipe()}
        onClose={() => setConfirm(false)}
      />
    </div>
  );
}
