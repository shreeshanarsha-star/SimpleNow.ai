import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionAccount } from "@/lib/gauriAuth";

export const dynamic = "force-dynamic";

// Vet/admin-only — feeds the product picker on the case-approval screen.
// Ported verbatim from askshree-app (v1)'s app/api/gauri/products/route.js.
export async function GET(req: Request) {
  const account = await getSessionAccount(req);
  if (!account || (account.role !== "vet" && account.role !== "admin")) {
    return NextResponse.json({ error: "Vet login required." }, { status: 401 });
  }
  const db = createAdminClient();
  const { data } = await db
    .from("gauri_products")
    .select("id, name, category, use_summary, dosage, pack_sizes, species, price")
    .eq("active", true)
    .order("category");
  return NextResponse.json({ products: data || [] });
}
