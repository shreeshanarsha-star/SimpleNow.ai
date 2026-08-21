import AppShell from "@/components/AppShell";
import GoldSearchGlyph from "@/components/GoldSearchGlyph";
import GlobalSearchBar from "@/components/GlobalSearchBar";

export default function OverviewPage() {
  return (
    <AppShell title="Overview">
      <div
        className="flex-1 flex flex-col min-h-0 relative -mx-[26px] -mb-[26px] overflow-hidden"
        id="overviewView"
      >
        {/* Decorative wave art -- purely atmospheric, sits behind the
            content and search bar, transitioning the panel from plain
            white up top to a soft champagne wash toward the bottom. */}
        <svg
          className="absolute inset-x-0 bottom-0 w-full h-[52%] pointer-events-none"
          viewBox="0 0 1000 320"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0,160 C220,90 420,210 1000,110 L1000,320 L0,320 Z" fill="#f8ecc9" opacity="0.9" />
          <path d="M0,210 C260,150 560,270 1000,180 L1000,320 L0,320 Z" fill="#f3e0a6" opacity="0.55" />
        </svg>

        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-[26px] relative z-10">
          <div className="w-[68px] h-[68px] rounded-full bg-white shadow-soft-sm flex items-center justify-center">
            <GoldSearchGlyph size={30} />
          </div>
          <div className="text-[26px] font-semibold text-ink mt-2 tracking-tight">
            What do you need?
          </div>
        </div>

        <div className="relative z-10">
          <GlobalSearchBar />
        </div>
      </div>
    </AppShell>
  );
}
