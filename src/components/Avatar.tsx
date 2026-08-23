// Shared avatar rendering: real profile picture when set, otherwise the
// initials badge every account row/greeting used before avatars existed.
// No "use client" -- pure presentational, safe in server or client trees.
export default function Avatar({
  name,
  email,
  avatarUrl,
  size = 30,
  className = "",
}: {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const label = (name || email || "").trim();
  const initials = label ? label.slice(0, 2).toUpperCase() : "?";

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars are
      // user-uploaded to Supabase Storage, not a known/optimizable domain set.
      <img
        src={avatarUrl}
        alt={label || "Profile picture"}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover flex-shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-gradient-to-br from-brand to-brand-dark text-white font-semibold flex items-center justify-center flex-shrink-0 shadow-emblem ${className}`}
    >
      <span style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}>{initials}</span>
    </div>
  );
}
