import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Server-only, service-role client — bypasses RLS entirely. Never import
// this into a Client Component or anything that ships to the browser.
// Used only inside Route Handlers, after verifying the caller is the
// authenticated owner (see requireAdmin() in ./requireAdmin.ts).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Add it in your environment (Vercel dashboard or .env.local) — see .env.example."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
