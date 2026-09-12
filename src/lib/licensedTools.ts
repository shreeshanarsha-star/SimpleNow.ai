import { SupabaseClient } from "@supabase/supabase-js";
import { DEPARTMENTS, PERSONAL_TOOLS, type Tool } from "./departments";

export interface LicensedTool {
  name: string;
  href: string;
  icon: string;
  group: "personal" | "licensed";
}

export const PERSONAL_TOOL_DEFS: LicensedTool[] = [
  { name: "Calculator", href: "/tools/calculator", icon: "calculator", group: "personal" },
  { name: "Quick Notes", href: "/tools/notes", icon: "book", group: "personal" },
  { name: "To-Do List", href: "/tools/todo", icon: "check", group: "personal" },
  { name: "Calendar", href: "/tools/calendar", icon: "calendar", group: "personal" },
  { name: "Clock", href: "/tools/clock", icon: "clock", group: "personal" },
  { name: "Timer / Stopwatch", href: "/tools/timer", icon: "play", group: "personal" },
  { name: "Unit Converter", href: "/tools/converter", icon: "chart", group: "personal" },
  { name: "Jotz", href: "/tools/jotz", icon: "edit", group: "personal" },
];

export const BUNDLED_TOOLS: LicensedTool[] = [
  { name: "Intelexa.ai", href: "/tools/intelexa", icon: "mic", group: "personal" },
  { name: "Team Chat", href: "/chat", icon: "chat", group: "personal" },
  { name: "Contracts & eSign", href: "/tools/contracts-esign", icon: "scale", group: "personal" },
  { name: "Gauri.ai", href: "/gauri", icon: "headset", group: "personal" },
];

const TOOL_ICONS: Record<string, string> = {
  "Calculator": "calculator",
  "Quick Notes": "book",
  "To-Do List": "check",
  "Calendar": "calendar",
  "Clock": "clock",
  "Timer / Stopwatch": "play",
  "Unit Converter": "chart",
  "Jotz": "edit",
  "Intelexa.ai": "mic",
  "Team Chat": "chat",
  "Contracts & eSign": "scale",
  "Gauri.ai": "headset",
  "Shortlist.ai": "filter",
  "JD Studio.ai": "upload",
  "Talent.ai": "users",
  "Job Postings.ai": "megaphone",
  "Smart Source.ai": "globe",
  "Smart Screen.ai": "search",
  "Assessment.ai": "check",
  "Offer.ai": "mail",
};

/**
 * Returns all tools the user has access/license to:
 * - All personal tools (Calculator, Notes, Todo, etc.) & bundled tools
 * - Plus enterprise tools licensed to the user's organization
 */
export async function getLicensedToolsForUser(
  supabase: SupabaseClient<any>,
  userId?: string | null
): Promise<LicensedTool[]> {
  const tools: LicensedTool[] = [...PERSONAL_TOOL_DEFS, ...BUNDLED_TOOLS];
  const seenHrefs = new Set(tools.map((t) => t.href));

  if (!userId) {
    return tools;
  }

  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin, org_id")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.is_admin) {
      // Platform owner sees all live tools
      for (const dept of DEPARTMENTS) {
        for (const t of dept.tools) {
          if (t.s === "live" && t.href && !seenHrefs.has(t.href)) {
            tools.push({
              name: t.n,
              href: t.href,
              icon: TOOL_ICONS[t.n] || dept.icon || "grid",
              group: "licensed",
            });
            seenHrefs.add(t.href);
          }
        }
      }
      for (const t of PERSONAL_TOOLS.tools) {
        if (t.s === "live" && t.href && !seenHrefs.has(t.href)) {
          tools.push({
            name: t.n,
            href: t.href,
            icon: TOOL_ICONS[t.n] || "grid",
            group: "licensed",
          });
          seenHrefs.add(t.href);
        }
      }
      return tools;
    }

    if (!profile?.org_id) {
      return tools;
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("plan, status")
      .eq("id", profile.org_id)
      .maybeSingle();

    if (org?.status !== "approved") {
      return tools;
    }

    if (org.plan === "bulk") {
      // Bulk plan gets every live tool
      for (const dept of DEPARTMENTS) {
        for (const t of dept.tools) {
          if (t.s === "live" && t.href && !seenHrefs.has(t.href)) {
            tools.push({
              name: t.n,
              href: t.href,
              icon: TOOL_ICONS[t.n] || dept.icon || "grid",
              group: "licensed",
            });
            seenHrefs.add(t.href);
          }
        }
      }
      for (const t of PERSONAL_TOOLS.tools) {
        if (t.s === "live" && t.href && !seenHrefs.has(t.href)) {
          tools.push({
            name: t.n,
            href: t.href,
            icon: TOOL_ICONS[t.n] || "grid",
            group: "licensed",
          });
          seenHrefs.add(t.href);
        }
      }
      return tools;
    }

    // Individual plan - check explicit feature_access grants
    const { data: grants } = await supabase
      .from("feature_access")
      .select("feature_key")
      .eq("org_id", profile.org_id);

    const grantedKeys = new Set((grants || []).map((g) => g.feature_key));

    const checkAndAdd = (t: Tool, defaultIcon: string) => {
      if (t.s === "live" && t.href && !seenHrefs.has(t.href)) {
        if (t.bundled || grantedKeys.has(t.n)) {
          tools.push({
            name: t.n,
            href: t.href,
            icon: TOOL_ICONS[t.n] || defaultIcon || "grid",
            group: "licensed",
          });
          seenHrefs.add(t.href);
        }
      }
    };

    for (const dept of DEPARTMENTS) {
      for (const t of dept.tools) {
        checkAndAdd(t, dept.icon);
      }
    }

    for (const t of PERSONAL_TOOLS.tools) {
      checkAndAdd(t, "grid");
    }
  } catch (err) {
    console.error("Error fetching licensed tools:", err);
  }

  return tools;
}
