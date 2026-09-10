import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch Intelexa Profile
  const { data: profile } = await supabase
    .from("intelexa_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  // Fetch Saved Recipients
  const { data: recipients } = await supabase
    .from("intelexa_recipients")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  // If no Intelexa profile yet, pre-populate from core profile
  if (!profile) {
    const { data: coreProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({
      profile: {
        user_id: user.id,
        email: user.email,
        name: coreProfile?.full_name || "",
        whatsapp_number: "",
        job_title: "",
        company: "",
        industry: "",
        business_interests: "",
        products_services: "",
        target_customers: "",
        geography: "",
        professional_objectives: "",
        what_matters_to_me: "",
      },
      recipients: recipients || [],
    });
  }

  return NextResponse.json({
    profile,
    recipients: recipients || [],
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { profile, recipients } = body;

    if (!profile?.email) {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    // Upsert Profile
    const { data: savedProfile, error: profileErr } = await supabase
      .from("intelexa_profiles")
      .upsert(
        {
          user_id: user.id,
          name: profile.name || null,
          email: profile.email.trim(),
          whatsapp_number: profile.whatsapp_number?.trim() || null,
          job_title: profile.job_title || null,
          company: profile.company || null,
          industry: profile.industry || null,
          business_interests: profile.business_interests || null,
          products_services: profile.products_services || null,
          target_customers: profile.target_customers || null,
          geography: profile.geography || null,
          professional_objectives: profile.professional_objectives || null,
          what_matters_to_me: profile.what_matters_to_me || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // Replace or Update Recipients if provided
    if (Array.isArray(recipients)) {
      // Clear existing recipients
      await supabase.from("intelexa_recipients").delete().eq("user_id", user.id);

      // Insert new list
      if (recipients.length > 0) {
        const rows = recipients.map((r) => ({
          user_id: user.id,
          name: r.name || "",
          email: r.email?.trim() || "",
          whatsapp_number: r.whatsapp_number?.trim() || "",
          delivery_email: r.delivery_email !== false,
          delivery_whatsapp: r.delivery_whatsapp !== false,
          is_primary: Boolean(r.is_primary),
        }));
        await supabase.from("intelexa_recipients").insert(rows);
      }
    }

    const { data: updatedRecipients } = await supabase
      .from("intelexa_recipients")
      .select("*")
      .eq("user_id", user.id);

    return NextResponse.json({
      profile: savedProfile,
      recipients: updatedRecipients || [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to save profile" },
      { status: 500 }
    );
  }
}
