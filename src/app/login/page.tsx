"use client";

import LogoMark from "@/components/LogoMark";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error, data } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    // Only the owner lands in the admin console by default -- everyone
    // else goes to the regular Overview page. Previously this always
    // redirected to /admin regardless of who signed in, which dropped
    // brand-new, no-access-yet users straight into the approval queue.
    let destination = params.get("next") || "/";
    if (!params.get("next") && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", data.user.id)
        .maybeSingle();
      if (profile?.is_admin) destination = "/admin";
    }

    setLoading(false);
    router.push(destination);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 shadow-soft"
      >
        <LogoMark size={30} />
        <div className="mb-4" />
        <h1 className="text-[19px] font-bold m-0 mb-1">Sign in</h1>
        <p className="text-[12.5px] text-ink-muted m-0 mb-6">
          Sign in to your Askshree account.
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-6 outline-none focus:border-brand"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white font-bold text-[13px] rounded-sm py-2.5 disabled:opacity-60 shadow-soft-sm"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>

        <p className="text-[12px] text-ink-muted text-center mt-4 mb-0">
          New here?{" "}
          <Link href="/signup" className="text-brand font-bold">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}
