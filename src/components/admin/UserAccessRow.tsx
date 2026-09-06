"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Profile = {
  id: string;
  email: string | null;
  is_admin: boolean;
  created_at: string;
};

export default function UserAccessRow({
  user,
  features,
  grantedFeatures,
}: {
  user: Profile;
  features: string[];
  grantedFeatures: string[];
}) {
  const router = useRouter();
  const [busyFeature, setBusyFeature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const granted = new Set(grantedFeatures);

  async function toggle(feature: string, isGranted: boolean) {
    setBusyFeature(feature);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/access`, {
        method: isGranted ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureKey: feature }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update access.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update access.");
    } finally {
      setBusyFeature(null);
    }
  }

  return (
    <div className="border border-border rounded-md bg-surface px-4 py-3">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-8 h-8 rounded-full bg-ink text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
          {(user.email || "?").slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-medium truncate">{user.email}</div>
          <div className="text-[11px] text-ink-muted" suppressHydrationWarning>
            Joined {new Date(user.created_at).toLocaleDateString()}
          </div>
        </div>
        {user.is_admin && (
          <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-brand-wash text-brand">
            Admin — full access
          </span>
        )}
      </div>

      {error && <p className="text-[12px] text-critical mb-2">{error}</p>}

      {!user.is_admin && (
        <div className="flex flex-wrap gap-2">
          {features.map((feature) => {
            const isGranted = granted.has(feature);
            return (
              <button
                key={feature}
                onClick={() => toggle(feature, isGranted)}
                disabled={busyFeature === feature}
                className={`text-[12px] font-bold px-3 py-1.5 rounded-sm border disabled:opacity-50 ${
                  isGranted
                    ? "bg-good-wash text-good-text border-transparent"
                    : "bg-page text-ink-muted border-border"
                }`}
              >
                {isGranted ? "✓ " : ""}
                {feature}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
