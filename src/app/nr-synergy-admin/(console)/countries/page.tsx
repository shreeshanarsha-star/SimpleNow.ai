import { admin as s } from "@/lib/nrs/i18n/en/admin";
import CountriesSection from "../../_sections/CountriesSection";

export const metadata = { title: `${s.console.nav.countries} · NR Synergy Admin Console` };

export default function AdminCountriesPage() {
  return (
    <>
      <h1 className="sr-only">{s.console.nav.countries}</h1>
      <CountriesSection />
    </>
  );
}
