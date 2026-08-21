"use client";

import LogoMark from "@/components/LogoMark";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-page px-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 text-center">
          <h1 className="text-[18px] font-bold m-0 mb-2">Check your email</h1>
          <p className="text-[13px] text-ink-2 m-0 mb-4">
            We sent a confirmation link to <strong>{email}</strong>. Once you confirm,
            you can sign in — but every tool stays locked until the admin grants you
            access to it.
          </p>
          <Link href="/login" className="text-brand text-[13px] font-bold">
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded-lg p-8"
      >
        <LogoMark size={30} />
        <div className="mb-4" />
        <h1 className="text-[19px] font-bold m-0 mb-1">Create an account</h1>
        <p className="text-[12.5px] text-ink-muted m-0 mb-6">
          After you sign up, the admin grants access to specific tools — nothing is
          open by default.
        </p>

        {error && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <label className="block text-[12px] font-bold mb-1.5">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-4 outline-none focus:border-brand"
        />

        <label className="block text-[12px] font-bold mb-1.5">Password</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-6 outline-none focus:border-brand"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white font-bold text-[13px] rounded-sm py-2.5 disabled:opacity-60"
        >
          {loading ? "Creating account…" : "Sign up"}
        </button>

        <p className="text-[12px] text-ink-muted text-center mt-4 mb-0">
          Already have an account?{" "}
          <Link href="/login" className="text-brand font-bold">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
