"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

export default function OnboardingOrganizationPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/org/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create your organization.");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create your organization.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 shadow-soft"
      >
        <Logo height={32} />
        <div className="mb-4" />
        <h1 className="text-[19px] font-bold m-0 mb-1">One last thing</h1>
        <p className="text-[12.5px] text-ink-muted m-0 mb-6">
          What&apos;s your organization called? It needs a quick approval from the platform
          owner before your team can use any tools.
        </p>

        {error && (
          <div className="bg-critical-wash text-critical text-[12.5px] rounded-sm px-3 py-2 mb-4">
            {error}
          </div>
        )}

        <label className="block text-[12px] font-bold mb-1.5">Organization name</label>
        <input
          type="text"
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Acme Inc."
          className="w-full border border-border rounded-sm px-3 py-2.5 text-[13.5px] mb-6 outline-none focus:border-brand"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white font-bold text-[13px] rounded-sm py-2.5 disabled:opacity-60 shadow-soft-sm"
        >
          {loading ? "Creating…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
