"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    // By the time this page loads, /auth/callback has already exchanged
    // the recovery link's code for a short-lived session -- updateUser
    // here just sets the new password on that session.
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => {
      router.push("/login");
      router.refresh();
    }, 1800);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page px-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 text-center">
          <h1 className="text-[18px] font-bold m-0 mb-2">Password updated</h1>
          <p className="text-[13px] text-ink-2 m-0">Taking you to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 shadow-soft"
      >
        <Logo height={32} />
        <div className="mb-4" />
        <h1 className="text-[19px] font-bold m-0 mb-1">Set a new password</h1>
        <p className="text-[12.5px] text-ink-muted m-0 mb-6">
          Choose a new password for your account.
        </p>

        {error && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <label className="block text-[12px] font-bold mb-1.5">New password</label>
        <input
          type="password"
          required
          minLength={6}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-4 outline-none focus:border-brand"
        />

        <label className="block text-[12px] font-bold mb-1.5">Confirm password</label>
        <input
          type="password"
          required
          minLength={6}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-6 outline-none focus:border-brand"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white font-bold text-[13px] rounded-sm py-2.5 disabled:opacity-60 shadow-soft-sm"
        >
          {loading ? "Updating…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
