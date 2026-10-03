import { t } from "@/lib/nrs/i18n/en";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3 py-2">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="h-7 w-40 rounded-sm bg-page animate-pulse" />
      <div className="h-10 w-full rounded-sm bg-page animate-pulse" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-20 rounded-md bg-page animate-pulse" />
        ))}
      </div>
    </div>
  );
}
