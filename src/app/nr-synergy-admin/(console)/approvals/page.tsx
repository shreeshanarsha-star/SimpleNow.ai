import { admin as s } from "@/lib/nrs/i18n/en/admin";
import ChainsSection from "../../_sections/ChainsSection";

export const metadata = { title: `${s.console.nav.approvals} · NR Synergy Admin Console` };

export default function AdminApprovalsPage() {
  return (
    <>
      <h1 className="sr-only">{s.console.nav.approvals}</h1>
      <ChainsSection />
    </>
  );
}
