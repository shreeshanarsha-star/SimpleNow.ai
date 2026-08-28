"use client";

import Icon from "@/components/Icon";
import type { ClockPlace } from "@/lib/clock/place";
import { snapshotFor } from "@/lib/clock/place";
import { formatUtcOffset, businessStatusMeta } from "@/lib/clock/businessHours";
import type { WeatherNow } from "@/lib/clock/weather";

interface ComparePanelProps {
  places: ClockPlace[];
  now: Date;
  weatherByPlace: Record<string, WeatherNow | null | undefined>;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function ComparePanel({ places, now, weatherByPlace, onRemove, onClear }: ComparePanelProps) {
  if (!places.length) return null;

  return (
    <div className="border border-border rounded-lg bg-surface p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
          Compare ({places.length}/5)
        </div>
        <button onClick={onClear} className="text-[11.5px] font-semibold text-ink-muted hover:text-ink">
          Clear all
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {places.map((place) => {
          const snap = snapshotFor(place, now);
          const statusMeta = businessStatusMeta(snap.status);
          const weather = weatherByPlace[place.id];
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
            <div key={place.id} className="flex-shrink-0 w-[170px] border border-border rounded-md p-3 relative">
              <button
                onClick={() => onRemove(place.id)}
                aria-label={`Remove ${place.city} from compare`}
                className="absolute top-2 right-2 text-ink-muted hover:text-critical"
              >
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-center gap-1.5">
                <span className="text-[16px] leading-none">{place.flag}</span>
                <span className="text-[12px] font-semibold text-ink truncate">{place.city}</span>
              </div>
              <div className="text-[19px] font-bold tabular-nums text-ink mt-1.5">{timeLabel}</div>
              <div className="text-[10.5px] text-ink-muted mt-0.5">
                {dateLabel} · {formatUtcOffset(snap.parts.utcOffsetMinutes)}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10.5px] font-semibold flex items-center gap-1">
                  <span aria-hidden>{statusMeta.dot}</span>
                  <span className={statusMeta.className}>{statusMeta.label}</span>
                </span>
                {weather && (
                  <span className="text-[10.5px] font-semibold text-ink-2">{weather.tempC}°C</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
