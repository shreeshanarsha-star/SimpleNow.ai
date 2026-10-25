"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Icon from "@/components/Icon";
import RemiStudio from "../RemiStudio";
import type { RemiPublicWorkspace } from "../types";
import { api, Btn, Card } from "./ui";

function useQr(text: string) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(text, { width: 512, margin: 1, errorCorrectionLevel: "M" }).then(setUrl).catch(() => setUrl(null));
  }, [text]);
  return url;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [ok, setOk] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-[11.5px] font-semibold text-ink-2">{label}</div>
      <div className="flex gap-2">
        <input readOnly value={value} className="flex-1 h-9 rounded-xl border border-border bg-page px-3 text-[12px] font-mono" onFocus={(e) => e.target.select()} />
        <Btn onClick={() => { navigator.clipboard?.writeText(value); setOk(true); setTimeout(() => setOk(false), 1500); }}>
          <Icon name={ok ? "check" : "copy"} className="w-3.5 h-3.5" /> {ok ? "Copied" : "Copy"}
        </Btn>
      </div>
    </div>
  );
}

export default function ShareTab({ slug, active }: { slug: string; active: boolean }) {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://simplenow.ai";
  const pub = `${origin}/remi/${slug}`;
  const kiosk = `${pub}?mode=kiosk`;
  const qrTarget = `${pub}?src=qr`;
  const qr = useQr(qrTarget);
  const [ws, setWs] = useState<RemiPublicWorkspace | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active) return;
    api<{ workspace: RemiPublicWorkspace }>(`/api/remi/public/${slug}`).then((d) => setWs(d.workspace)).catch((e) => setErr(e.message));
  }, [slug, active, nonce]);

  return (
    <div className="grid xl:grid-cols-[1fr_420px] gap-4">
      <div className="space-y-4 min-w-0">
        <Card title="Test console" icon="mic" action={<Btn onClick={() => { setWs(null); setNonce((n) => n + 1); }}><Icon name="refresh" className="w-3.5 h-3.5" /> New test chat</Btn>}>
          <p className="text-[11.5px] text-ink-muted mb-3">
            Exactly what customers get — approved Brains only. Try asking in Hindi, Kannada, Spanish or Arabic, use the mic, and check the evidence under each answer. Test chats are excluded from the dashboard.
          </p>
          {!active ? (
            <div className="text-[12.5px] text-critical">This assistant is switched off. Turn it on in Settings to test and share.</div>
          ) : err ? (
            <div className="text-[12.5px] text-critical">{err}</div>
          ) : ws ? (
            <RemiStudio key={nonce} ws={ws} channel="test" className="h-[620px]" />
          ) : (
            <div className="text-sm text-ink-muted">Loading…</div>
          )}
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Share" icon="share">
          <div className="space-y-3">
            <CopyRow label="Public page (website, email signature, WhatsApp)" value={pub} />
            <CopyRow label="Exhibition kiosk (full-screen, hands-free)" value={kiosk} />
            <CopyRow label="Embed on your website" value={`<iframe src="${pub}" style="width:100%;height:720px;border:0;border-radius:16px" allow="microphone; autoplay"></iframe>`} />
            <div className="flex gap-2">
              <a href={pub} target="_blank" rel="noreferrer"><Btn variant="soft"><Icon name="externalLink" className="w-3.5 h-3.5" /> Open page</Btn></a>
              <a href={kiosk} target="_blank" rel="noreferrer"><Btn variant="soft"><Icon name="maximize" className="w-3.5 h-3.5" /> Launch kiosk</Btn></a>
            </div>
          </div>
        </Card>
        <Card title="Stall QR code" icon="globe">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- data: URL QR, nothing to optimise */}
            {qr ? <img src={qr} alt="QR code to the Dr.Remi page" className="w-36 h-36 rounded-xl border border-border bg-white p-1" /> : <div className="w-36 h-36 bg-page rounded-xl" />}
            <div className="text-[11.5px] text-ink-muted space-y-2">
              <p>Print it at your stall: visitors scan and continue the conversation on their own phone, in their language. Scans are tracked as the &quot;qr&quot; channel.</p>
              {qr && <a href={qr} download={`dr-remi-${slug}-qr.png`}><Btn><Icon name="download" className="w-3.5 h-3.5" /> Download PNG</Btn></a>}
            </div>
          </div>
        </Card>
        <Card title="Exhibition set-up" icon="bluetooth">
          <ol className="list-decimal pl-4 space-y-1.5 text-[12px] text-ink-2">
            <li>Use a laptop or tablet with Chrome or Edge. Pair a Bluetooth speaker — or better, a Bluetooth/USB <b>speakerphone</b> (speaker + noise-cancelling mic).</li>
            <li>Open the kiosk link, tap the Bluetooth icon and choose the speaker and microphone.</li>
            <li>Press full-screen. Visitors tap once; Dr.Remi greets them and listens hands-free.</li>
            <li>After {"the idle time set in Settings"} without speech, the visit is summarised, emailed to your team (with consent) and the kiosk resets for the next visitor.</li>
            <li>Keep the QR code next to the screen for visitors who prefer their own phone.</li>
          </ol>
        </Card>
      </div>
    </div>
  );
}
