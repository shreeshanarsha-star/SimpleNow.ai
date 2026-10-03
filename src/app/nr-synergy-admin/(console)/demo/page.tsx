import { admin as s } from "@/lib/nrs/i18n/en/admin";
import DemoSection from "../../_sections/DemoSection";

export const metadata = { title: `${s.console.nav.demo} · NR Synergy Admin Console` };

export default function AdminDemoPage() {
  return (
    <>
      <h1 className="sr-only">{s.console.nav.demo}</h1>
      <DemoSection />
    </>
  );
}
