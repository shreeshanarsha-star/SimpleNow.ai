import Link from "next/link";
import Icon from "@/components/Icon";

// Centered empty / access state used across NR Synergy pages.
export default function NrsState({
  icon = "grid",
  title,
  body,
  action,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: { href: string; label: string };
}) {
  return (
    <section className="flex-1 flex flex-col items-center justify-center text-center gap-2.5 py-16 px-4">
      <div className="w-12 h-12 rounded-full bg-brand-wash text-brand flex items-center justify-center mb-1">
        <Icon name={icon} className="w-6 h-6" />
      </div>
      <h2 className="text-[16px] font-bold text-ink">{title}</h2>
      {body && <p className="text-[12.5px] text-ink-muted max-w-[360px] leading-relaxed">{body}</p>}
      {action && (
        <Link
          href={action.href}
          className="bg-brand text-white text-[12.5px] font-bold px-4 py-2 rounded-sm mt-1 shadow-soft-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {action.label}
        </Link>
      )}
    </section>
  );
}
