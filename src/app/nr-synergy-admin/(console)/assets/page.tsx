import { desk } from "@/lib/nrs/i18n/en/desk";
import AssetsSection from "../../_sections/AssetsSection";

export const metadata = { title: `${desk.assets.title} · NR Synergy Admin Console` };

export default function AdminAssetsPage() {
  return (
    <>
      <h1 className="sr-only">{desk.assets.title}</h1>
      <AssetsSection />
    </>
  );
}
