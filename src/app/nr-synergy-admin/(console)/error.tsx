"use client";

import { useEffect } from "react";
import Icon from "@/components/Icon";
import { admin as s } from "@/lib/nrs/i18n/en/admin";

export default function AdminConsoleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[nrs-admin]", error);
  }, [error]);

  return (
    <section role="alert" className="flex flex-col items-center justify-center text-center gap-2.5 py-16 px-4">
      <div className="w-12 h-12 rounded-full bg-critical-wash text-critical flex items-center justify-center mb-1">
        <Icon name="x" className="w-6 h-6" />
      </div>
      <h1 className="text-[16px] font-bold text-ink">{s.common.error}</h1>
      <button
        type="button"
        onClick={reset}
        className="mt-1 rounded-sm bg-brand px-4 py-2 text-[12.5px] font-bold text-white shadow-soft-sm hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {s.common.retry}
      </button>
    </section>
  );
}
