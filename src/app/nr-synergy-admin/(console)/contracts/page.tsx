import { admin as s } from "@/lib/nrs/i18n/en/admin";
import ContractsSection from "../../_sections/ContractsSection";

export const metadata = { title: `${s.console.nav.contracts} · NR Synergy Admin Console` };

export default function AdminContractsPage() {
  return (
    <>
      <h1 className="sr-only">{s.console.nav.contracts}</h1>
      <ContractsSection />
    </>
  );
}
