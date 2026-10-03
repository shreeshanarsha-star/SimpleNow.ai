import { admin as s } from "@/lib/nrs/i18n/en/admin";

// "NR Synergy · Admin Console" wordmark used by the console header and sign-in.
export default function ConsoleMark({ size = "md" }: { size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <span
        aria-hidden="true"
        className={`${lg ? "w-10 h-10 text-[14px]" : "w-8 h-8 text-[12px]"} shrink-0 rounded-md bg-brand text-white font-bold flex items-center justify-center shadow-soft-sm tracking-tight`}
      >
        NR
      </span>
      <span className="min-w-0 leading-tight">
        <span className={`block font-bold text-ink truncate ${lg ? "text-[16px]" : "text-[13.5px]"}`}>{s.console.product}</span>
        <span className={`block font-semibold uppercase tracking-[0.12em] text-brand-dark truncate ${lg ? "text-[10.5px]" : "text-[9.5px]"}`}>
          {s.console.name}
        </span>
      </span>
    </span>
  );
}
