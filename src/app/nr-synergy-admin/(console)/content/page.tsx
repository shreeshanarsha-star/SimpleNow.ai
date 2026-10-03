import { admin as s } from "@/lib/nrs/i18n/en/admin";
import ContentSection from "../../_sections/ContentSection";

export const metadata = { title: `${s.console.nav.content} · NR Synergy Admin Console` };

export default function AdminContentPage() {
  return (
    <>
      <h1 className="sr-only">{s.console.nav.content}</h1>
      <ContentSection />
    </>
  );
}
