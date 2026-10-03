import { admin as s } from "@/lib/nrs/i18n/en/admin";
import PoliciesSection from "../../_sections/PoliciesSection";

export const metadata = { title: `${s.sections.policies} · NR Synergy Admin Console` };

export default function AdminPoliciesPage() {
  return (
    <>
      <h1 className="sr-only">{s.sections.policies}</h1>
      <PoliciesSection />
    </>
  );
}
