"use client";

import { useRef, useState } from "react";
import Avatar from "./Avatar";
import Icon from "./Icon";

// Clickable avatar that doubles as the profile-picture upload control --
// click (or tab+enter) opens a file picker, uploads to /api/profile/avatar,
// and swaps in the new image immediately on success. Used anywhere a user
// should be able to set their own picture, not just view it (see Avatar
// for the read-only version used elsewhere, e.g. Sidebar's account row).
export default function ProfileAvatar({
  name,
  avatarUrl,
  loaded,
  size = 44,
  onUploaded,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  loaded: boolean;
  size?: number;
  onUploaded?: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(avatarUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed.");
      setLocalUrl(data.avatarUrl);
      onUploaded?.(data.avatarUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  if (!loaded) {
    return (
      <div
        style={{ width: size, height: size }}
        className="rounded-full bg-page animate-pulse flex-shrink-0"
      />
    );
  }

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        title="Change profile picture"
        className="block rounded-full overflow-hidden group relative"
        style={{ width: size, height: size }}
      >
        <Avatar name={name} avatarUrl={localUrl} size={size} />
        <span className="absolute inset-0 rounded-full bg-ink/0 group-hover:bg-ink/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <Icon name="upload" className="w-4 h-4 text-white" />
        </span>
      </button>
      {uploading && (
        <span className="absolute inset-0 rounded-full bg-ink/40 flex items-center justify-center">
          <Icon name="upload" className="w-4 h-4 text-white animate-pulse" />
        </span>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {error && (
        <span className="absolute top-full left-0 mt-1 text-[10px] text-critical whitespace-nowrap z-10">
          {error}
        </span>
      )}
    </div>
  );
}
