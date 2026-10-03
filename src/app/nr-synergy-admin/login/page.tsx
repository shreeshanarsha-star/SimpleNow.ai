import { redirect } from "next/navigation";
import { getNrsContext } from "@/lib/nrs/member";
import { safeAdminNext } from "@/lib/nrs/adminConsole";
import AdminLoginForm from "./AdminLoginForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · NR Synergy Admin Console" };

// Dedicated Admin Console sign-in. Already signed in as HR / super admin /
// platform admin -> straight into the console. Signed in without admin
// rights -> the form, with a note to use an admin account.
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const sp = await searchParams;
  const nextParam = Array.isArray(sp.next) ? sp.next[0] : sp.next;
  const next = safeAdminNext(nextParam);

  const ctx = await getNrsContext();
  const email = ctx && !ctx.user.is_anonymous && ctx.user.email ? ctx.user.email : null;
  if (email && ctx?.isHr) redirect(next);

  return <AdminLoginForm next={next} signedInNonAdmin={email} />;
}
