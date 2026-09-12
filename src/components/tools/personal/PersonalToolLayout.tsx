import React from "react";
import Icon from "@/components/Icon";
import { LicensedTool } from "@/lib/licensedTools";

export default function PersonalToolLayout({
  title,
  description,
  icon = "grid",
  children,
}: {
  title: string;
  description?: string;
  icon?: string;
  currentHref?: string;
  licensedTools?: LicensedTool[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Top Header Row with Title and Iconic Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-wash text-brand flex items-center justify-center font-bold shadow-soft-sm flex-shrink-0">
            <Icon name={icon} className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[17px] font-bold text-ink leading-tight">{title}</h1>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full bg-brand-wash text-brand">
                Personal Tool
              </span>
            </div>
            {description && (
              <p className="text-[12px] text-ink-muted mt-0.5 leading-snug">{description}</p>
            )}
          </div>
        </div>
      </div>

      {/* Main Tool Content (Full Width, Zero Clutter) */}
      <div className="w-full min-w-0">
        {children}
      </div>
    </div>
  );
}
