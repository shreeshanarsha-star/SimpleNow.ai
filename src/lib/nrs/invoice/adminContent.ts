import { HttpError, countryCode, intOrNull, isoDate, oneOf, str, strArray, uuid } from "./kit";
import type { ContentKind } from "./adminTypes";

// Admin content: per-kind table, columns, validation and delete behaviour.

export interface ContentSpec {
  table: string;
  columns: string;
  order: { column: string; ascending: boolean };
  /** soft: set this column instead of deleting. */
  softDelete?: "deleted_at" | "archived_at";
  /** Rows not soft-deleted (filter applied when listing). */
  activeFilter?: "deleted_at" | "archived_at";
  parse: (b: Record<string, unknown>, creating: boolean) => Record<string, unknown>;
}

const POST_KINDS = ["leadership", "news", "division"] as const;
const EVENT_KINDS = ["townhall", "training", "tradefair", "other"] as const;
const DOC_CATEGORIES = ["hr", "travel_expense", "conduct", "it_security", "sop", "forms", "company"] as const;
const AUDIENCES = ["all", "consultant", "payroll", "managers"] as const;

function pick(b: Record<string, unknown>, creating: boolean, key: string): boolean {
  return creating || key in b;
}

function httpsUrl(v: unknown, field: string, optional: boolean): string | null {
  const s = str(v, field, { optional: true, max: 2000 });
  if (!s) {
    if (optional) return null;
    throw new HttpError(`${field} is required`);
  }
  if (!/^https:\/\/[^\s]+$/i.test(s)) throw new HttpError(`${field} must start with https://`);
  return s;
}

export const CONTENT: Record<ContentKind, ContentSpec> = {
  posts: {
    table: "nrs_posts",
    columns: "id, kind, title, body, author_member_id, pinned, published_at, is_demo, created_at",
    order: { column: "created_at", ascending: false },
    softDelete: "deleted_at",
    activeFilter: "deleted_at",
    parse: (b, c) => {
      const o: Record<string, unknown> = {};
      if (pick(b, c, "kind")) o.kind = oneOf(b.kind, POST_KINDS, "Kind");
      if (pick(b, c, "title")) o.title = str(b.title, "Title", { max: 200 });
      if (pick(b, c, "body")) o.body = str(b.body, "Body", { max: 10000 });
      if (pick(b, c, "pinned")) o.pinned = b.pinned === true;
      if ("author_member_id" in b) o.author_member_id = b.author_member_id ? uuid(b.author_member_id, "Author") : null;
      if ("publish" in b) o.published_at = b.publish === true ? new Date().toISOString() : null;
      return o;
    },
  },
  events: {
    table: "nrs_events",
    columns: "id, kind, title, starts_at, location, link, is_demo, created_at",
    order: { column: "starts_at", ascending: false },
    parse: (b, c) => {
      const o: Record<string, unknown> = {};
      if (pick(b, c, "kind")) o.kind = oneOf(b.kind, EVENT_KINDS, "Kind");
      if (pick(b, c, "title")) o.title = str(b.title, "Title", { max: 200 });
      if (pick(b, c, "starts_at")) {
        const s = str(b.starts_at, "Start time", { max: 40 });
        const t = Date.parse(s);
        if (Number.isNaN(t)) throw new HttpError("Start time is not valid");
        o.starts_at = new Date(t).toISOString();
      }
      if (pick(b, c, "location")) o.location = str(b.location, "Location", { optional: true, max: 200 });
      if (pick(b, c, "link")) o.link = httpsUrl(b.link, "Link", true);
      return o;
    },
  },
  documents: {
    table: "nrs_documents",
    columns: "id, category, title, country_code, audience, requires_ack, is_demo, created_at, archived_at",
    order: { column: "created_at", ascending: false },
    softDelete: "archived_at",
    activeFilter: "archived_at",
    parse: (b, c) => {
      const o: Record<string, unknown> = {};
      if (pick(b, c, "category")) o.category = oneOf(b.category, DOC_CATEGORIES, "Category");
      if (pick(b, c, "title")) o.title = str(b.title, "Title", { max: 200 });
      if (pick(b, c, "country_code")) o.country_code = b.country_code ? countryCode(b.country_code) : null;
      if (pick(b, c, "audience")) o.audience = oneOf(b.audience ?? "all", AUDIENCES, "Audience");
      if (pick(b, c, "requires_ack")) o.requires_ack = b.requires_ack === true;
      return o;
    },
  },
  values: {
    table: "nrs_values",
    columns: "id, name, meaning, behaviours, not_this, leader_message, sort, is_demo",
    order: { column: "sort", ascending: true },
    parse: (b, c) => {
      const o: Record<string, unknown> = {};
      if (pick(b, c, "name")) o.name = str(b.name, "Name", { max: 100 });
      if (pick(b, c, "meaning")) o.meaning = str(b.meaning, "Meaning", { max: 2000 });
      if (pick(b, c, "behaviours")) o.behaviours = strArray(b.behaviours, "Behaviours", 20);
      if (pick(b, c, "not_this")) o.not_this = strArray(b.not_this, "Not this", 20);
      if (pick(b, c, "leader_message")) o.leader_message = str(b.leader_message, "Leader message", { optional: true, max: 4000 });
      if (pick(b, c, "sort")) o.sort = intOrNull(b.sort, "Sort", 0, 1000) ?? 0;
      return o;
    },
  },
  quick_links: {
    table: "nrs_quick_links",
    columns: "id, title, url, description, sort",
    order: { column: "sort", ascending: true },
    parse: (b, c) => {
      const o: Record<string, unknown> = {};
      if (pick(b, c, "title")) o.title = str(b.title, "Title", { max: 120 });
      if (pick(b, c, "url")) o.url = httpsUrl(b.url, "URL", false);
      if (pick(b, c, "description")) o.description = str(b.description, "Description", { optional: true, max: 300 });
      if (pick(b, c, "sort")) o.sort = intOrNull(b.sort, "Sort", 0, 1000) ?? 0;
      return o;
    },
  },
};

export function parseVersion(b: Record<string, unknown>) {
  return {
    version: str(b.version, "Version", { max: 20 }),
    effective_from: isoDate(b.effective_from, "Effective from"),
    summary: str(b.summary, "Summary", { optional: true, max: 1000 }),
    body_markdown: str(b.body_markdown, "Body", { optional: true, max: 200_000 }),
  };
}
