"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { createClient } from "@/lib/supabase/client";
import { admin as s } from "@/lib/nrs/i18n/en/admin";
import { ADMIN_LOGIN_PATH } from "@/lib/nrs/adminConsole";

// Signs out and returns to the Admin Console sign-in (not the platform /login).
export default function ConsoleSignOut({ label = s.console.signOut }: { label?: string }) {
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await createClient().auth.signOut();
    } finally {
      window.location.href = ADMIN_LOGIN_PATH;
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-surface px-3 py-1.5 text-[12px] font-bold text-ink-2 transition-colors hover:bg-page hover:text-ink disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Icon name="logout" className="w-3.5 h-3.5" />
      <span>{busy ? s.console.signingOut : label}</span>
    </button>
  );
}
