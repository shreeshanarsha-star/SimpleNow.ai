"use client";

import { useEffect } from "react";
import { t } from "@/lib/nrs/i18n/en";

// Error boundary body for the Projects, Knowledge and Help routes.
export default function ModuleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[nrs]", error);
  }, [error]);
  return (
    <section role="alert" className="flex-1 flex flex-col items-center justify-center text-center gap-2.5 py-16 px-4">
      <h2 className="text-[16px] font-bold text-ink">{t("common.error")}</h2>
      <button
        type="button"
        onClick={reset}
        className="bg-brand text-white text-[12.5px] font-bold px-4 py-2 rounded-sm mt-1 shadow-soft-sm hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {t("common.retry")}
      </button>
    </section>
  );
}
