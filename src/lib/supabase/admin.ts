import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only, service-role client — bypasses RLS entirely. Never import
// this into a Client Component or anything that ships to the browser.
// Used only inside Route Handlers, after verifying the caller is the
// authenticated admin (see requireAdminUser() in ./requireAdmin.ts).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Neither SUPABASE_SERVICE_ROLE_KEY nor NEXT_PUBLIC_SUPABASE_ANON_KEY is set."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
