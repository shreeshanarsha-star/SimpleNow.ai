"use client";

import Icon from "@/components/Icon";
import type { ClockPlace } from "@/lib/clock/place";
import { snapshotFor } from "@/lib/clock/place";
import { formatUtcOffset, businessStatusMeta } from "@/lib/clock/businessHours";
import type { WeatherNow } from "@/lib/clock/weather";

interface LocationCardProps {
  place: ClockPlace;
  now: Date;
  weather: WeatherNow | null | undefined; // undefined = still loading
  active?: boolean;
  pinned?: boolean;
  compact?: boolean;
  onClick?: () => void;
  onTogglePin?: (e: React.MouseEvent) => void;
}

export default function LocationCard({
  place,
  now,
  weather,
  active,
  pinned,
  compact,
  onClick,
  onTogglePin,
}: LocationCardProps) {
  const snap = snapshotFor(place, now);
  const statusMeta = businessStatusMeta(snap.status);
  const timeLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: place.timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: place.timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);

  return (
    <button
      onClick={onClick}
      className={`text-left border rounded-lg bg-surface p-3.5 flex-shrink-0 transition-colors ${
        active ? "border-brand ring-1 ring-brand" : "border-border hover:border-border-strong"
      } ${compact ? "w-[168px]" : "w-[196px]"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[18px] leading-none">{place.flag}</span>
          <span className="text-[12.5px] font-semibold text-ink truncate">{place.city}</span>
        </div>
        {onTogglePin && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(e);
            }}
            aria-label={pinned ? "Unpin location" : "Pin location"}
            className={`flex-shrink-0 ${pinned ? "text-warning" : "text-ink-muted hover:text-ink-2"}`}
          >
            <Icon name="star" className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      <div className="text-[22px] font-bold tabular-nums text-ink leading-tight mt-1.5">{timeLabel}</div>
      <div className="text-[11px] text-ink-muted mt-0.5">
        {dateLabel} · {formatUtcOffset(snap.parts.utcOffsetMinutes)}
      </div>

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[11px] font-semibold flex items-center gap-1">
          <span aria-hidden>{statusMeta.dot}</span>
          <span className={statusMeta.className}>{statusMeta.label}</span>
        </span>
        {weather === undefined ? (
          <span className="text-[11px] text-ink-muted">…</span>
        ) : weather ? (
          <span className="text-[11px] font-semibold text-ink-2 flex items-center gap-1">
            <Icon name={weather.icon} className="w-3 h-3" />
            {weather.tempC}°C
          </span>
        ) : (
          <span className="text-[10.5px] text-ink-muted">Weather unavailable</span>
        )}
      </div>
    </button>
  );
}
