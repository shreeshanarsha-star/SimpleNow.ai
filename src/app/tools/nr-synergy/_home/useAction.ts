"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { t } from "@/lib/nrs/i18n/en";

// POST JSON to an NR Synergy API route, surface its { error } message, and
// refresh the server components on success so lists re-read from the DB.
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (url: string, body: unknown, opts: { refresh?: boolean } = {}): Promise<boolean> => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          let msg = t("common.error");
          try {
            const data = (await res.json()) as { error?: unknown };
            if (typeof data.error === "string" && data.error) msg = data.error;
          } catch {
            // keep the generic message
          }
          setError(msg);
          return false;
        }
        if (opts.refresh !== false) router.refresh();
        return true;
      } catch {
        setError(t("common.error"));
        return false;
      } finally {
        setPending(false);
      }
    },
    [router]
  );

  return { run, pending, error, setError };
}
