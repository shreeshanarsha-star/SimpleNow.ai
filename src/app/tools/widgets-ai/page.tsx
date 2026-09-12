import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const TOOL_ROUTES: Record<string, string> = {
  calculator: "/tools/calculator",
  notes: "/tools/notes",
  todo: "/tools/todo",
  calendar: "/tools/calendar",
  clock: "/tools/clock",
  timer: "/tools/timer",
  converter: "/tools/converter",
};

export default async function WidgetsAiPage({
  searchParams,
}: {
  searchParams: Promise<{ tool?: string }>;
}) {
  const { tool } = await searchParams;
  const target = (tool && TOOL_ROUTES[tool]) || "/tools/calculator";
  redirect(target);
}
