"use client";
// Presenter.ai — the 30-second opening montage that plays after the snap,
// while the twin connects in the background. Images from the project's
// research visuals; captions are mood lines only (no facts).
import { useEffect, useRef, useState } from "react";

const FRAMES: Array<{ src: string; line: string }> = [
  { src: "m00", line: "Every era has a turning point." },
  { src: "m03", line: "AI learned to answer…" },
  { src: "m04", line: "…then to work beside us." },
  { src: "m11", line: "Agents don't just talk. They do." },
  { src: "m06", line: "In the lab." },
  { src: "m07", line: "On the farm." },
  { src: "m08", line: "In the field." },
  { src: "m09", line: "In HR." },
  { src: "m13", line: "With people in charge." },
  { src: "m12", line: "With trust built in." },
  { src: "m10", line: "Learning together." },
  { src: "m14", line: "The path is open." },
  { src: "m01", line: "Tonight, meet your co-host." },
];
const FRAME_MS = 1900;
const TITLE_MS = 3200;
export const MONTAGE_MS = FRAMES.length * FRAME_MS + TITLE_MS;

export default function Montage({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    FRAMES.forEach((f) => {
      const im = new Image();
      im.src = `/presenter/montage/${f.src}.jpg`;
    });
    const started = Date.now();
    const iv = setInterval(() => {
      const t = Date.now() - started;
      const n = Math.floor(t / FRAME_MS);
      setI(Math.min(n, FRAMES.length));
      if (t >= MONTAGE_MS) {
        clearInterval(iv);
        done.current();
      }
    }, 100);
    return () => clearInterval(iv);
  }, []);

  if (i >= FRAMES.length)
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[2vw] bg-black animate-[fadein_0.8s_ease-out]">
        <img src="/flyer/nrpl-logo.png" alt="" className="w-[12vw] rounded-2xl bg-white p-[0.8vw]" />
        <div className="text-[1.4vw] uppercase tracking-[0.5em] text-orange-400">Natural Remedies · P&amp;C</div>
        <div className="text-[6vw] font-black leading-none">The Rise of AI Agents</div>
        <style>{`@keyframes fadein{from{opacity:0;transform:scale(1.04)}to{opacity:1;transform:none}}`}</style>
      </div>
    );

  const f = FRAMES[i];
  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      {FRAMES.map((fr, k) => (
        <div key={fr.src} className="absolute inset-0 transition-opacity duration-500" style={{ opacity: k === i ? 1 : 0 }}>
          {/* blurred fill + full image, so portrait-ish frames still fill a 16:9 TV */}
          <div className="absolute inset-0 scale-110 bg-cover bg-center blur-2xl opacity-60" style={{ backgroundImage: `url(/presenter/montage/${fr.src}.jpg)` }} />
          <img
            src={`/presenter/montage/${fr.src}.jpg`}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            style={{ animation: k === i ? `kb${k % 2} ${FRAME_MS + 600}ms linear forwards` : undefined }}
          />
        </div>
      ))}
      <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-t from-black/85 to-transparent" />
      <div key={i} className="absolute bottom-[8%] left-0 right-0 text-center text-[3.4vw] font-bold tracking-tight animate-[cap_1.9s_ease-out]">
        {f.line}
      </div>
      <style>{`
        @keyframes kb0{from{transform:scale(1.0) translateX(0)}to{transform:scale(1.08) translateX(-1.5%)}}
        @keyframes kb1{from{transform:scale(1.08) translateX(-1%)}to{transform:scale(1.0) translateX(1%)}}
        @keyframes cap{0%{opacity:0;transform:translateY(12px)}15%{opacity:1;transform:none}85%{opacity:1}100%{opacity:0}}
      `}</style>
    </div>
  );
}
