"use client";

import { useEffect, useState } from "react";

const THEMES: { id: string; label: string; swatch: string }[] = [
  { id: "gold", label: "Gold", swatch: "#c9932e" },
  { id: "blue", label: "Blue", swatch: "#2563dc" },
  { id: "dark", label: "Dark", swatch: "#4b2f96" },
  { id: "teal", label: "Teal", swatch: "#149a80" },
];

export default function ThemeSwitcher() {
  const [active, setActive] = useState("gold");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") || "gold";
    setActive(current);
  }, []);

  function pick(id: string) {
    document.documentElement.setAttribute("data-theme", id);
    try {
      localStorage.setItem("askshree-theme", id);
    } catch {}
    setActive(id);
  }

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          aria-label={`${t.label} theme`}
          aria-pressed={active === t.id}
          onClick={() => pick(t.id)}
          className={`w-[15px] h-[15px] rounded-full border border-black/10 transition-transform ${
            active === t.id ? "ring-2 ring-offset-2 ring-brand ring-offset-surface scale-110" : "hover:scale-110"
          }`}
          style={{ background: t.swatch }}
        />
      ))}
    </div>
  );
}
