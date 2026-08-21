"use client";

export default function Topbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-[5] bg-page/90 backdrop-blur-sm border-b border-border px-[26px] py-4 flex items-center justify-between gap-4">
      <h1 className="m-0 text-[16px] font-semibold text-ink">{title}</h1>
    </header>
  );
}
