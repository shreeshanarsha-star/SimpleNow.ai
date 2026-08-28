"use client";
import { useEffect, useRef } from "react";
import { getTheme } from "./gauriThemes";

// Particle shape varies per theme mode (spiral/blackhole/etc. each carry
// different fields) -- same dynamically-shaped point objects as v1's
// untyped JS, so this stays loosely typed rather than forcing an
// artificial union.
type PtRecord = { [key: string]: number };

// Animated canvas background for the Gauri.ai pages -- ported from
// askshree-app (v1)'s components/ThemeBackground.js, with the `anchorSelector`
// prop (used there to wrap the ring around the homepage reactor, which v2
// doesn't have) dropped since Gauri.ai only ever uses the plain
// viewport-relative centering.
export default function GauriThemeBackground({ themeId }: { themeId?: string | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Particle shape varies per theme mode (spiral/blackhole/etc. each carry
  // different fields) -- same dynamically-shaped point objects as v1's
  // untyped JS, so this stays loosely typed rather than forcing an
  // artificial union.
  const stateRef = useRef<{ pts: PtRecord[]; t: number }>({ pts: [], t: 0 });

  useEffect(() => {
    const theme = getTheme(themeId);
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let W = 0,
      H = 0,
      raf: number;
    const color = theme.particleColor;

    function sized() {
      const rect = c!.parentElement!.getBoundingClientRect();
      W = Math.max(rect.width, window.innerWidth, 300);
      H = Math.max(rect.height, document.body.scrollHeight, 600);
      c!.width = W;
      c!.height = H;
      seed();
    }

    // Every point carries the full field set (zero-filled where a mode
    // doesn't use a field) so PtRecord can stay a plain number index
    // signature -- avoids optional-field undefined-checks scattered through
    // every tick() branch below, with identical runtime values to v1.
    function blankPt(): PtRecord {
      return { x: 0, y: 0, vx: 0, vy: 0, size: 0, tw: 0, r: 0, baseAngle: 0, angle: 0, rOffset: 0, speed: 0 };
    }

    function seed() {
      const s = stateRef.current;
      const count = theme.mode === "deepfield" ? 260 : theme.mode === "nebula" ? 70 : theme.mode === "blackhole" ? 190 : 130;
      s.pts = Array.from({ length: count }, (_, i) => {
        const p = blankPt();
        if (theme.mode === "spiral") {
          const arm = i % 3;
          p.r = (i / count) * Math.max(W, H) * 0.55;
          p.baseAngle = i * 0.35 + arm * ((Math.PI * 2) / 3);
          p.size = 0.6 + Math.random() * 1.8;
          p.tw = Math.random() * Math.PI * 2;
          return p;
        }
        if (theme.mode === "blackhole") {
          p.angle = Math.random() * Math.PI * 2;
          const tight = Math.random() < 0.82;
          p.rOffset = tight ? (Math.random() - 0.5) * 90 : (Math.random() - 0.5) * 260;
          p.speed = 0.003 + Math.random() * 0.005;
          p.size = tight ? 1.6 + Math.random() * 2.8 : 0.8 + Math.random() * 1.6;
          return p;
        }
        if (theme.mode === "sunrise") {
          p.x = Math.random() * W;
          p.y = Math.random() * H * 0.55;
          p.size = 0.5 + Math.random() * 1.4;
          p.tw = Math.random() * Math.PI * 2;
          return p;
        }
        p.x = Math.random() * W;
        p.y = Math.random() * H;
        p.vx = (Math.random() - 0.5) * (theme.mode === "network" ? 0.5 : 0.12);
        p.vy = (Math.random() - 0.5) * (theme.mode === "network" ? 0.5 : 0.12);
        p.size = theme.mode === "nebula" ? 60 + Math.random() * 120 : 0.6 + Math.random() * 1.8;
        p.tw = Math.random() * Math.PI * 2;
        return p;
      });
    }

    sized();
    window.addEventListener("resize", sized);
    const rt = setTimeout(sized, 300);

    function handleVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        raf = requestAnimationFrame(tick);
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);

    function tick() {
      const s = stateRef.current;
      s.t += 1;
      ctx!.clearRect(0, 0, W, H);

      if (theme.mode === "spiral") {
        const cx = W * 0.5,
          cy = H * 0.42;
        s.pts.forEach((p) => {
          const angle = p.baseAngle + s.t * 0.0011;
          const x = cx + Math.cos(angle) * p.r;
          const y = cy + Math.sin(angle) * p.r * 0.62;
          const flicker = 0.5 + 0.5 * Math.sin(s.t * 0.02 + p.tw);
          ctx!.beginPath();
          ctx!.fillStyle = `rgba(${color},${0.25 + flicker * 0.55})`;
          ctx!.arc(x, y, p.size, 0, Math.PI * 2);
          ctx!.fill();
        });
      } else if (theme.mode === "blackhole") {
        const cx = W * 0.5,
          cy = H * 0.42;
        const radius = Math.max(240, Math.min(W, H) * 0.4);
        const grd = ctx!.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grd.addColorStop(0, "rgba(0,0,0,1)");
        grd.addColorStop(0.55, "rgba(0,0,0,0.9)");
        grd.addColorStop(0.75, `rgba(${color},0.32)`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = grd;
        ctx!.beginPath();
        ctx!.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx!.fill();
        const ringPulse = 0.5 + 0.5 * Math.sin(s.t * 0.015);
        const ringR = radius * 0.78;
        ctx!.save();
        ctx!.strokeStyle = `rgba(${color},${0.85 + ringPulse * 0.15})`;
        ctx!.lineWidth = 4;
        ctx!.shadowColor = `rgba(${color},1)`;
        ctx!.shadowBlur = 26;
        ctx!.beginPath();
        ctx!.arc(cx, cy, ringR, 0, Math.PI * 2);
        ctx!.stroke();
        ctx!.restore();
        s.pts.forEach((p) => {
          p.angle += p.speed;
          const r = ringR + p.rOffset;
          const x = cx + Math.cos(p.angle) * r;
          const y = cy + Math.sin(p.angle) * r;
          const nearRim = Math.abs(p.rOffset) < 45 ? 1 : 0.4;
          ctx!.beginPath();
          ctx!.fillStyle = `rgba(${color},${0.5 + nearRim * 0.5})`;
          if (nearRim === 1) {
            ctx!.shadowColor = `rgba(${color},0.9)`;
            ctx!.shadowBlur = 8;
          } else {
            ctx!.shadowBlur = 0;
          }
          ctx!.arc(x, y, p.size, 0, Math.PI * 2);
          ctx!.fill();
        });
        ctx!.shadowBlur = 0;
      } else if (theme.mode === "nebula") {
        s.pts.forEach((p, i) => {
          if (p.size > 20) {
            p.x += p.vx * 0.4;
            p.y += p.vy * 0.4;
            if (p.x < -200) p.x = W + 200;
            if (p.x > W + 200) p.x = -200;
            if (p.y < -200) p.y = H + 200;
            if (p.y > H + 200) p.y = -200;
            const pulse = 0.5 + 0.5 * Math.sin(s.t * 0.006 + i);
            const grd = ctx!.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            grd.addColorStop(0, `rgba(${color},${0.1 + pulse * 0.08})`);
            grd.addColorStop(1, "rgba(0,0,0,0)");
            ctx!.fillStyle = grd;
            ctx!.beginPath();
            ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx!.fill();
          } else {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > W) p.vx *= -1;
            if (p.y < 0 || p.y > H) p.vy *= -1;
            const flicker = 0.4 + 0.6 * Math.sin(s.t * 0.03 + p.tw);
            ctx!.beginPath();
            ctx!.fillStyle = `rgba(255,255,255,${flicker * 0.6})`;
            ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx!.fill();
          }
        });
      } else if (theme.mode === "sunrise") {
        const cx = W * 0.5,
          cy = H * 1.02;
        const pulse = 0.5 + 0.5 * Math.sin(s.t * 0.008);
        const grd = ctx!.createRadialGradient(cx, cy, 0, cx, cy, W * 0.55);
        grd.addColorStop(0, `rgba(${color},${0.3 + pulse * 0.12})`);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx!.fillStyle = grd;
        ctx!.beginPath();
        ctx!.arc(cx, cy, W * 0.55, 0, Math.PI * 2);
        ctx!.fill();
        s.pts.forEach((p) => {
          const flicker = 0.3 + 0.7 * Math.sin(s.t * 0.02 + p.tw);
          ctx!.beginPath();
          ctx!.fillStyle = `rgba(255,255,255,${flicker * 0.7})`;
          ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx!.fill();
        });
      } else if (theme.mode === "network") {
        s.pts.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > W) p.vx *= -1;
          if (p.y < 0 || p.y > H) p.vy *= -1;
        });
        for (let i = 0; i < s.pts.length; i++) {
          for (let j = i + 1; j < s.pts.length; j++) {
            const a = s.pts[i],
              b = s.pts[j];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < 140) {
              ctx!.strokeStyle = `rgba(${color},${0.16 * (1 - d / 140)})`;
              ctx!.lineWidth = 0.7;
              ctx!.beginPath();
              ctx!.moveTo(a.x, a.y);
              ctx!.lineTo(b.x, b.y);
              ctx!.stroke();
            }
          }
        }
        s.pts.forEach((p) => {
          ctx!.beginPath();
          ctx!.fillStyle = `rgba(${color},0.75)`;
          ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx!.fill();
        });
      } else if (theme.mode === "deepfield") {
        s.pts.forEach((p) => {
          const flicker = 0.25 + 0.75 * Math.sin(s.t * 0.015 + p.tw);
          ctx!.beginPath();
          ctx!.fillStyle = `rgba(${color},${flicker * 0.85})`;
          ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx!.fill();
        });
      }

      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("resize", sized);
      document.removeEventListener("visibilitychange", handleVisibility);
      clearTimeout(rt);
      cancelAnimationFrame(raf);
    };
  }, [themeId]);

  const theme = getTheme(themeId);
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: -1, background: theme.gradient }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}
