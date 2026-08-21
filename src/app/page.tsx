import AppShell from "@/components/AppShell";
import GoldSearchGlyph from "@/components/GoldSearchGlyph";
import GlobalSearchBar from "@/components/GlobalSearchBar";

export default function OverviewPage() {
  return (
    <AppShell title="Overview">
      <div className="flex-1 flex flex-col min-h-0 -mx-[26px] -mb-[26px]" id="overviewView">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-[26px]">
          <GoldSearchGlyph size={44} />
          <div className="text-[26px] font-semibold text-ink mt-2 tracking-tight">
            What do you need?
          </div>
        </div>

        {/* Sticky to the viewport bottom -- lands on the same line as
            Sidebar's bottom profile/settings row, "after settings" in the
            layout, rather than floating with a gap above the page edge. */}
        <GlobalSearchBar />
      </div>
    </AppShell>
  );
}
