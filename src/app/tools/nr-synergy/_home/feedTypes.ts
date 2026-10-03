// Shared (server + client) shapes for the Home feed.
export const REACTIONS = ["like", "celebrate", "support", "insightful"] as const;
export type Reaction = (typeof REACTIONS)[number];

export function isReaction(v: unknown): v is Reaction {
  return typeof v === "string" && (REACTIONS as readonly string[]).includes(v);
}

export interface FeedComment {
  id: string;
  author: string;
  body: string;
  created_at: string;
}

export interface FeedPost {
  id: string;
  kind: "leadership" | "news" | "division";
  title: string;
  body: string;
  author: string | null;
  pinned: boolean;
  published_at: string;
  counts: Record<Reaction, number>;
  mine: Reaction[];
  comments: FeedComment[];
}
