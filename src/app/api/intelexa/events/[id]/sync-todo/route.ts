import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { task, deadline, event_name } = body;

    if (!task || !task.trim()) {
      return NextResponse.json({ error: "Task description is required." }, { status: 400 });
    }

    const todoText = `[Intelexa] ${task.trim()}${event_name ? ` (from ${event_name})` : ""}`;

    // Get max position
    const { data: existing } = await supabase
      .from("personal_todos")
      .select("position")
      .eq("user_id", user.id)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextPosition = existing ? existing.position + 1 : 0;

    // Optional parse YYYY-MM-DD
    let dueDate: string | null = null;
    if (deadline && typeof deadline === "string") {
      const match = deadline.match(/\d{4}-\d{2}-\d{2}/);
      if (match) dueDate = match[0];
    }

    const { data: todo, error } = await supabase
      .from("personal_todos")
      .insert({
        user_id: user.id,
        text: todoText,
        position: nextPosition,
        due_date: dueDate,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, todo });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to sync task" },
      { status: 500 }
    );
  }
}
