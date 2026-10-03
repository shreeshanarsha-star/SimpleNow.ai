"use client";

import { useEffect, useRef, useState } from "react";
import { money as s } from "@/lib/nrs/i18n/en/money";
import { SIG_HEIGHT, SIG_WIDTH, strokesToPath, type SigPoint } from "@/lib/nrs/invoice/signature";
import { Button, Card, ErrorBox, Loading, Notice, api, errorText, useLoad } from "./ui";

interface SigDto {
  signature: { path: string; updated_at: string } | null;
}

function SignaturePreview({ path, label }: { path: string; label: string }) {
  return (
    <svg
      viewBox={`0 0 ${SIG_WIDTH} ${SIG_HEIGHT}`}
      role="img"
      aria-label={label}
      className="w-full max-w-[360px] h-auto rounded-md border border-border bg-white"
    >
      <path d={path} fill="none" stroke="#1d1b17" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Pad({ onSaved, onCancel }: { onSaved: (path: string) => void; onCancel?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<SigPoint[][]>([]);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const resize = () => {
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(rect.width * dpr);
      c.height = Math.round(rect.height * dpr);
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineWidth = 2.2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#1d1b17";
      }
      strokes.current = [];
      setHasInk(false);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): SigPoint => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    strokes.current.push([p]);
    const ctx = e.currentTarget.getContext("2d");
    ctx?.beginPath();
    ctx?.moveTo(p.x, p.y);
    ctx?.lineTo(p.x + 0.1, p.y);
    ctx?.stroke();
    setHasInk(true);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = point(e);
    const stroke = strokes.current[strokes.current.length - 1];
    const last = stroke[stroke.length - 1];
    stroke.push(p);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };
  const up = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    strokes.current = [];
    setHasInk(false);
  };

  const save = async () => {
    const c = canvasRef.current;
    if (!c || !hasInk) return setError(s.invoices.signatureEmpty);
    const rect = c.getBoundingClientRect();
    const path = strokesToPath(strokes.current, rect.width, rect.height);
    setBusy(true);
    setError(null);
    try {
      await api("/api/nr-synergy/money/signature", { method: "PUT", body: JSON.stringify({ path }) });
      onSaved(path);
    } catch (e) {
      setError(errorText(e, s.common.error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <canvas
        ref={canvasRef}
        aria-label={s.invoices.signaturePadLabel}
        role="img"
        className="w-full max-w-[480px] aspect-[3/1] touch-none rounded-md border border-dashed border-border-strong bg-white cursor-crosshair"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      {error && <ErrorBox message={error} />}
      <div className="flex flex-wrap gap-2">
        <Button onClick={clear} disabled={!hasInk || busy}>
          {s.invoices.signatureClear}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {s.common.cancel}
          </Button>
        )}
        <Button variant="primary" busy={busy} onClick={() => void save()}>
          {s.invoices.signatureSave}
        </Button>
      </div>
    </div>
  );
}

export default function SignatureSection({ onChange }: { onChange: () => void }) {
  const sig = useLoad(() => api<SigDto>("/api/nr-synergy/money/signature"), []);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  return (
    <Card>
      <h3 className="text-[14px] font-bold text-ink">{s.invoices.signatureTitle}</h3>
      <p className="text-[12.5px] text-ink-muted mb-3">{s.invoices.signatureBody}</p>
      {sig.loading && !sig.data ? (
        <Loading label={s.common.loading} />
      ) : sig.error ? (
        <ErrorBox message={sig.error} onRetry={sig.reload} retryLabel={s.common.retry} />
      ) : sig.data?.signature && !editing ? (
        <div className="flex flex-col gap-2">
          {saved && <Notice message={s.invoices.signatureSaved} />}
          <SignaturePreview path={sig.data.signature.path} label={s.invoices.signatureCurrent} />
          <div>
            <Button onClick={() => setEditing(true)}>{s.invoices.signatureReplace}</Button>
          </div>
        </div>
      ) : (
        <Pad
          onCancel={sig.data?.signature ? () => setEditing(false) : undefined}
          onSaved={(path) => {
            sig.setData({ signature: { path, updated_at: new Date().toISOString() } });
            setEditing(false);
            setSaved(true);
            onChange();
          }}
        />
      )}
    </Card>
  );
}
