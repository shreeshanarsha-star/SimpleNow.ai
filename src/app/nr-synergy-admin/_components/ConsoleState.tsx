import type { ReactNode } from "react";
import Icon from "@/components/Icon";
import ConsoleMark from "./ConsoleMark";

// Full-screen state card for the console (no access, licence, no org).
export default function ConsoleState({
  icon,
  title,
  body,
  children,
}: {
  icon: string;
  title: string;
  body: string;
  children?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-page flex items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg border border-border bg-surface p-6 sm:p-8 shadow-soft text-center">
        <div className="flex justify-center mb-6">
          <ConsoleMark />
        </div>
        <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-brand-wash text-brand flex items-center justify-center">
          <Icon name={icon} className="w-6 h-6" />
        </div>
        <h1 className="text-[17px] font-bold text-ink">{title}</h1>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-muted">{body}</p>
        {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{children}</div>}
      </section>
    </main>
  );
}
