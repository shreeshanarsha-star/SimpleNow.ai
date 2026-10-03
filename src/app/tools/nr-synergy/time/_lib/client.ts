// Small fetch helper for NR Synergy client components.

export async function postJson<T>(url: string, body: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg =
        json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string"
          ? (json as { error: string }).error
          : null;
      return { ok: false, error: msg ?? `Request failed (${res.status})` };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, error: "Network error. Check your connection and try again." };
  }
}
