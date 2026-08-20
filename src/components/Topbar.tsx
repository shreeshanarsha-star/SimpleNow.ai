"use client";

import Icon from "./Icon";

export default function Topbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-[5] bg-page/90 backdrop-blur-sm border-b border-border px-[26px] py-3.5 flex items-center justify-between gap-4">
      <h1 className="m-0 text-[16.5px] font-bold">{title}</h1>
      <div className="flex items-center gap-2">
        <button
          className="w-[34px] h-[34px] rounded-sm border border-border bg-surface flex items-center justify-center text-ink-2 hover:border-border-strong"
          aria-label="Ask Shree"
        >
          <Icon name="mic" className="w-[15px] h-[15px]" />
        </button>
      </div>
    </header>
  );
}
