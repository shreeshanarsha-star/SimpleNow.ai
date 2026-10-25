"use client";

// Dr.Remi's face: a calm, theme-aware emblem that breathes while idle,
// glows while listening (driven by mic level) and pulses while speaking.
export type RemiState = "idle" | "listening" | "thinking" | "speaking";

export default function RemiAvatar({
  size = 56,
  state = "idle",
  level = 0,
  initials = "Dr",
  src,
  alt = "Sales assistant",
}: {
  size?: number;
  state?: RemiState;
  level?: number;
  initials?: string;
  /** Workspace avatar photo; falls back to the drawn emblem. */
  src?: string | null;
  alt?: string;
}) {
  const ring = state === "listening" ? 1 + level * 0.18 : 1;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }} aria-hidden={!src}>
      <style>{`@keyframes remiBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}.remi-breathe{animation:remiBreathe 4s ease-in-out infinite}`}</style>
      {(state === "speaking" || state === "listening") && (
        <>
          <span className="absolute inset-0 rounded-full bg-brand/25 animate-ping" style={{ animationDuration: state === "speaking" ? "1.4s" : "2.2s" }} />
          <span className="absolute -inset-1 rounded-full border-2 border-brand/40" style={{ transform: `scale(${ring})`, transition: "transform 80ms linear" }} />
        </>
      )}
      <div
        className={`relative w-full h-full rounded-full p-[3px] bg-gradient-to-tr from-brand to-brand-dark shadow-emblem ${state === "idle" ? "remi-breathe" : ""}`}
      >
        <div className="w-full h-full rounded-full bg-surface overflow-hidden relative">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- tenant-uploaded avatar, arbitrary origin
            <img src={src} alt={alt} className="w-full h-full object-cover select-none" draggable={false} />
          ) : (
          <svg viewBox="0 0 100 100" className="w-full h-full">
            <defs>
              <radialGradient id="remiGlow" cx="50%" cy="38%" r="70%">
                <stop offset="0%" stopColor="var(--brand-wash)" />
                <stop offset="100%" stopColor="var(--surface)" />
              </radialGradient>
            </defs>
            <rect width="100" height="100" fill="url(#remiGlow)" />
            {/* stethoscope-like arc = "Dr" + sound wave = voice */}
            <path d="M28 30 v14 a22 22 0 0 0 44 0 v-14" fill="none" stroke="rgb(var(--brand-rgb))" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
            <circle cx="28" cy="27" r="4" fill="rgb(var(--brand-rgb))" />
            <circle cx="72" cy="27" r="4" fill="rgb(var(--brand-rgb))" />
            <path d="M50 66 v8" stroke="rgb(var(--brand-rgb))" strokeWidth="5" strokeLinecap="round" />
            <circle cx="50" cy="80" r="7" fill="var(--accent-btn-2)" />
            <text x="50" y="54" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--ink)" fontFamily="Inter, system-ui">
              {initials}
            </text>
          </svg>
          )}
          {state === "thinking" && (
            <div className="absolute inset-x-0 bottom-[18%] flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-brand animate-bounce" style={{ animationDelay: `${i * 120}ms` }} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
