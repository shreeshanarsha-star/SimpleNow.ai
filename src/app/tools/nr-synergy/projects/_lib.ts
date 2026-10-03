import type { Tone } from "../_home/ui";

export const PROJECT_STATUSES = ["on_track", "at_risk", "blocked", "completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === "string" && (PROJECT_STATUSES as readonly string[]).includes(v);
}

export const STATUS_TONE: Record<ProjectStatus, Tone> = {
  on_track: "good",
  at_risk: "warning",
  blocked: "critical",
  completed: "brand",
};

export interface ProjectRow {
  id: string;
  name: string;
  division: string | null;
  owner_member_id: string;
  status: ProjectStatus;
  progress_pct: number;
  next_milestone: string | null;
  next_milestone_on: string | null;
}

export interface ProjectUpdateRow {
  id: string;
  project_id: string;
  member_id: string;
  week_of: string;
  status: ProjectStatus;
  progress: string;
  challenges: string | null;
  plan_of_action: string | null;
  help_needed_member_id: string | null;
  next_milestone: string | null;
  next_milestone_on: string | null;
  created_at: string;
}

export const PROJECT_COLUMNS = "id, name, division, owner_member_id, status, progress_pct, next_milestone, next_milestone_on";
export const UPDATE_COLUMNS =
  "id, project_id, member_id, week_of, status, progress, challenges, plan_of_action, help_needed_member_id, next_milestone, next_milestone_on, created_at";
