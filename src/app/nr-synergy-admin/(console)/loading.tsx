import { admin as s } from "@/lib/nrs/i18n/en/admin";

export default function AdminConsoleLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-4 animate-pulse">
      <span className="sr-only">{s.common.loading}</span>
      <div className="h-6 w-48 rounded-sm bg-border/60" />
      <div className="h-3.5 w-72 max-w-full rounded-sm bg-border/40" />
      <div className="grid grid-cols-1 min-[390px]:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-lg border border-border bg-surface" />
        ))}
      </div>
      <div className="h-48 rounded-lg border border-border bg-surface" />
    </div>
  );
}
