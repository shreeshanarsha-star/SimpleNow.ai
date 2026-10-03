import { redirect } from "next/navigation";
import { NRS_ADMIN_BASE } from "@/lib/nrs/tabs";

// The admin area moved out of the employee app into the separate Admin
// Console. Old bookmarks land here and are sent on.
export default function LegacyNrSynergyAdminRedirect(): never {
  redirect(NRS_ADMIN_BASE);
}
