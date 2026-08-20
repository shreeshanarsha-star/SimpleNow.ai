import { createClient } from "./server";

// Every admin-only API route calls this first. Throws a Response the
// caller should return directly if the request isn't from a signed-in
// owner — never trust a client-supplied "isAdmin" flag.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { user, supabase };
}
