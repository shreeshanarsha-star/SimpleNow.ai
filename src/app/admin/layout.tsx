import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Everything under /admin is owner-only. Middleware already requires a
// login; this adds the is_admin check middleware can't cheaply do at the
// edge (would need a DB round-trip per request).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/admin");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    redirect("/?notAdmin=1");
  }

  return <>{children}</>;
}
