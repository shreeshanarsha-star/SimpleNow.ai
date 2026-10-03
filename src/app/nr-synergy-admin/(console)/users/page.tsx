import { admin as s } from "@/lib/nrs/i18n/en/admin";
import UsersSection from "../../_sections/UsersSection";

export const metadata = { title: `${s.console.nav.users} · NR Synergy Admin Console` };

export default function AdminUsersPage() {
  return (
    <>
      <h1 className="sr-only">{s.console.nav.users}</h1>
      <UsersSection />
    </>
  );
}
