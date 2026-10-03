import type { SupabaseClient } from "@supabase/supabase-js";
import type { NrsContext } from "@/lib/nrs/member";
import { notifyMembers, notifyRoles } from "@/lib/nrs/notify";
import { HttpError, guard, type Guarded } from "@/lib/nrs/invoice/kit";
import { travel as s, fillTravel as fill } from "@/lib/nrs/i18n/en/travel";
import {
  parseBookings,
  toBookingDto,
  type ChainStepDto,
  type StoredBooking,
  type TravelItemDto,
  type TravelRequestStatus,
} from "./types";

// Server helpers for travel requests: status chain, booking DTOs, travel
// desk access, queues and notifications. Always called with the
// service-role client and an explicit orgId.

export const DESK_LINK = "/tools/nr-synergy/desk/travel";
export const TRAVELLER_LINK = "/tools/nr-synergy/money";
export const TRAVEL_COLUMNS =
  "id, org_id, member_id, destination, purpose, starts_on, ends_on, estimated_minor, currency, status, created_at, bookings, booked_at, booked_by_member";

export interface TravelRow {
  id: string;
  org_id: string;
  member_id: string;
  destination: string;
  purpose: string;
  starts_on: string;
  ends_on: string;
  estimated_minor: number | string | null;
  currency: string | null;
  status: TravelRequestStatus;
  created_at: string;
  bookings: unknown;
  booked_at: string | null;
  booked_by_member: string | null;
}

export interface Traveller {
  id: string;
  name: string;
  designation: string | null;
  country: string | null;
}

export interface DeskTrip extends TravelItemDto {
  traveller: Traveller;
  approved_at: string | null;
}

export interface AwaitingItem {
  stepId: string;
  stepNo: number;
  trip: DeskTrip;
}

export interface DeskData {
  awaiting: AwaitingItem[];
  toBook: DeskTrip[];
  booked: DeskTrip[];
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

export interface DeskAccess {
  /** May record bookings and mark trips booked (travel desk or HR). */
  canBook: boolean;
  /** May decide travel-desk approval steps (travel desk role or super admin; mirrors nrs_has_role). */
  canApprove: boolean;
}

/** Reads roles straight from nrs_member_roles (independent of the cached ctx). */
export async function deskAccess(admin: SupabaseClient, ctx: NrsContext): Promise<DeskAccess> {
  if (!ctx.member) return { canBook: false, canApprove: false };
  const { data, error } = await admin.from("nrs_member_roles").select("role").eq("member_id", ctx.member.id);
  if (error) throw new Error(`Roles: ${error.message}`);
  const roles = new Set(((data ?? []) as { role: string }[]).map((r) => r.role));
  const travelDesk = roles.has("travel_desk");
  const superAdmin = roles.has("super_admin");
  return { canBook: travelDesk || ctx.isHr, canApprove: travelDesk || superAdmin };
}

/** Route guard: NR Synergy access + member + travel desk / HR. */
export async function guardDesk(): Promise<Guarded & { memberId: string; access: DeskAccess }> {
  const g = await guard();
  if (!g.ctx.member) throw new HttpError("You need an NR Synergy member profile for this.", 403);
  const access = await deskAccess(g.admin, g.ctx);
  if (!access.canBook) throw new HttpError("Only the travel desk or HR can do this.", 403);
  return { ...g, memberId: g.ctx.member.id, access };
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

async function memberNames(admin: SupabaseClient, orgId: string, ids: string[]) {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return new Map<string, { full_name: string; designation: string | null; home_country: string }>();
  const { data } = await admin
    .from("nrs_members")
    .select("id, full_name, designation, home_country")
    .eq("org_id", orgId)
    .in("id", uniq);
  return new Map(
    ((data ?? []) as { id: string; full_name: string; designation: string | null; home_country: string }[]).map((m) => [m.id, m])
  );
}

/** Approval chain per travel request id (empty when no request exists). */
export async function loadChains(
  admin: SupabaseClient,
  orgId: string,
  travelIds: string[]
): Promise<{ chains: Map<string, ChainStepDto[]>; approvedAt: Map<string, string | null> }> {
  const chains = new Map<string, ChainStepDto[]>();
  const approvedAt = new Map<string, string | null>();
  if (!travelIds.length) return { chains, approvedAt };
  const { data: reqs, error } = await admin
    .from("nrs_requests")
    .select("id, subject_id, status, decided_at")
    .eq("org_id", orgId)
    .eq("kind", "travel")
    .in("subject_id", travelIds);
  if (error) throw new Error(`Travel approvals: ${error.message}`);
  const requests = (reqs ?? []) as { id: string; subject_id: string; status: string; decided_at: string | null }[];
  if (!requests.length) return { chains, approvedAt };
  const { data: steps, error: sErr } = await admin
    .from("nrs_request_steps")
    .select("request_id, step_no, approver_type, approver_role, approver_member_id, status, decided_at, decided_by_member, comment")
    .in("request_id", requests.map((r) => r.id))
    .order("step_no", { ascending: true });
  if (sErr) throw new Error(`Travel approval steps: ${sErr.message}`);
  const rows = (steps ?? []) as {
    request_id: string;
    step_no: number;
    approver_type: ChainStepDto["approver_type"];
    approver_role: string | null;
    approver_member_id: string | null;
    status: string;
    decided_at: string | null;
    decided_by_member: string | null;
    comment: string | null;
  }[];
  const names = await memberNames(
    admin,
    orgId,
    rows.flatMap((r) => [r.approver_member_id ?? "", r.decided_by_member ?? ""])
  );
  const subjectOf = new Map(requests.map((r) => [r.id, r.subject_id]));
  for (const r of requests) {
    chains.set(r.subject_id, []);
    approvedAt.set(r.subject_id, r.status === "approved" ? r.decided_at : null);
  }
  for (const r of rows) {
    const subject = subjectOf.get(r.request_id);
    if (!subject) continue;
    chains.get(subject)!.push({
      step_no: r.step_no,
      approver_type: r.approver_type,
      approver_role: r.approver_role,
      approver_name: r.approver_member_id ? names.get(r.approver_member_id)?.full_name ?? null : null,
      status: r.status,
      decided_at: r.decided_at,
      decided_by: r.decided_by_member ? names.get(r.decided_by_member)?.full_name ?? null : null,
      comment: r.comment,
    });
  }
  return { chains, approvedAt };
}

/** Rows -> DTOs with chain + bookings (+ traveller for the desk). */
export async function toTrips(admin: SupabaseClient, orgId: string, rows: TravelRow[]): Promise<DeskTrip[]> {
  if (!rows.length) return [];
  const [{ chains, approvedAt }, names] = await Promise.all([
    loadChains(admin, orgId, rows.map((r) => r.id)),
    memberNames(admin, orgId, rows.flatMap((r) => [r.member_id, r.booked_by_member ?? ""])),
  ]);
  return rows.map((r) => {
    const m = names.get(r.member_id);
    return {
      id: r.id,
      destination: r.destination,
      purpose: r.purpose,
      starts_on: r.starts_on,
      ends_on: r.ends_on,
      estimated_minor: r.estimated_minor == null ? null : Number(r.estimated_minor),
      currency: r.currency,
      status: r.status,
      created_at: r.created_at,
      booked_at: r.booked_at,
      booked_by_name: r.booked_by_member ? names.get(r.booked_by_member)?.full_name ?? null : null,
      bookings: parseBookings(r.bookings).map(toBookingDto),
      chain: chains.get(r.id) ?? [],
      traveller: { id: r.member_id, name: m?.full_name ?? "—", designation: m?.designation ?? null, country: m?.home_country ?? null },
      approved_at: approvedAt.get(r.id) ?? null,
    };
  });
}

/** Strip desk-only fields for the traveller's own list. */
export function toTravellerItem(t: DeskTrip): TravelItemDto {
  const { traveller: _t, approved_at: _a, ...rest } = t;
  void _t;
  void _a;
  return rest;
}

// ---------------------------------------------------------------------------
// Desk queues
// ---------------------------------------------------------------------------

export async function loadDeskData(admin: SupabaseClient, orgId: string, meId: string | null): Promise<DeskData> {
  // 1. Pending travel-desk steps that are the current step of a pending travel request.
  const { data: stepData, error: stepErr } = await admin
    .from("nrs_request_steps")
    .select("id, request_id, step_no")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .eq("approver_type", "role")
    .eq("approver_role", "travel_desk");
  if (stepErr) throw new Error(`Travel desk queue: ${stepErr.message}`);
  const steps = (stepData ?? []) as { id: string; request_id: string; step_no: number }[];
  let awaitingPairs: { stepId: string; stepNo: number; subjectId: string }[] = [];
  if (steps.length) {
    const { data: reqData, error: reqErr } = await admin
      .from("nrs_requests")
      .select("id, subject_id, member_id, current_step")
      .eq("org_id", orgId)
      .eq("kind", "travel")
      .eq("status", "pending")
      .in("id", steps.map((s) => s.request_id));
    if (reqErr) throw new Error(`Travel desk queue: ${reqErr.message}`);
    const reqs = new Map(
      ((reqData ?? []) as { id: string; subject_id: string; member_id: string; current_step: number }[]).map((r) => [r.id, r])
    );
    awaitingPairs = steps
      .filter((st) => {
        const r = reqs.get(st.request_id);
        return !!r && r.current_step === st.step_no && r.member_id !== meId;
      })
      .map((st) => ({ stepId: st.id, stepNo: st.step_no, subjectId: reqs.get(st.request_id)!.subject_id }));
  }

  // 2. Trips: awaiting subjects, approved-not-booked, and the latest booked.
  const [awaitRes, toBookRes, bookedRes] = await Promise.all([
    awaitingPairs.length
      ? admin.from("nrs_travel_requests").select(TRAVEL_COLUMNS).eq("org_id", orgId).in("id", awaitingPairs.map((p) => p.subjectId))
      : Promise.resolve({ data: [] as TravelRow[], error: null }),
    admin
      .from("nrs_travel_requests")
      .select(TRAVEL_COLUMNS)
      .eq("org_id", orgId)
      .eq("status", "approved")
      .is("booked_at", null)
      .order("starts_on", { ascending: true })
      .limit(100),
    admin
      .from("nrs_travel_requests")
      .select(TRAVEL_COLUMNS)
      .eq("org_id", orgId)
      .eq("status", "booked")
      .order("booked_at", { ascending: false })
      .limit(20),
  ]);
  for (const r of [awaitRes, toBookRes, bookedRes]) if (r.error) throw new Error(`Travel desk: ${r.error.message}`);

  const all = [
    ...((awaitRes.data ?? []) as TravelRow[]),
    ...((toBookRes.data ?? []) as TravelRow[]),
    ...((bookedRes.data ?? []) as TravelRow[]),
  ];
  const unique = Array.from(new Map(all.map((r) => [r.id, r])).values());
  const trips = new Map((await toTrips(admin, orgId, unique)).map((t) => [t.id, t]));

  return {
    awaiting: awaitingPairs
      .filter((p) => trips.has(p.subjectId))
      .map((p) => ({ stepId: p.stepId, stepNo: p.stepNo, trip: trips.get(p.subjectId)! }))
      .sort((a, b) => a.trip.created_at.localeCompare(b.trip.created_at)),
    toBook: ((toBookRes.data ?? []) as TravelRow[]).map((r) => trips.get(r.id)!).filter(Boolean),
    booked: ((bookedRes.data ?? []) as TravelRow[]).map((r) => trips.get(r.id)!).filter(Boolean),
  };
}

/** Load one trip of the org (404 when missing). */
export async function loadTrip(admin: SupabaseClient, orgId: string, id: string): Promise<TravelRow & { bookingsParsed: StoredBooking[] }> {
  const { data, error } = await admin.from("nrs_travel_requests").select(TRAVEL_COLUMNS).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) throw new HttpError(`Travel request: ${error.message}`, 500);
  if (!data) throw new HttpError("Travel request not found", 404);
  const row = data as TravelRow;
  return { ...row, bookingsParsed: parseBookings(row.bookings) };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

/** Trip booked -> traveller. */
export async function notifyTripBooked(admin: SupabaseClient, trip: TravelRow, count: number): Promise<void> {
  await notifyMembers(admin, trip.org_id, [trip.member_id], {
    title: fill(s.notify.bookedTitle, { destination: trip.destination }),
    body: fill(s.notify.bookedBody, { count }),
    link: TRAVELLER_LINK,
  });
}

/**
 * Trip fully approved and waiting to be booked -> everyone with the
 * travel_desk role. Call after a travel request's final approval (the
 * approvals decide route owns that moment). Best-effort, never throws.
 */
export async function notifyTravelReadyToBook(admin: SupabaseClient, orgId: string, travelId: string): Promise<void> {
  try {
    const { data } = await admin
      .from("nrs_travel_requests")
      .select("destination, starts_on, ends_on, member_id, status")
      .eq("org_id", orgId)
      .eq("id", travelId)
      .maybeSingle();
    const t = data as { destination: string; starts_on: string; ends_on: string; member_id: string; status: string } | null;
    if (!t || t.status !== "approved") return;
    const names = await memberNames(admin, orgId, [t.member_id]);
    await notifyRoles(admin, orgId, ["travel_desk"], {
      title: fill(s.notify.toBookTitle, { destination: t.destination }),
      body: fill(s.notify.toBookBody, { name: names.get(t.member_id)?.full_name ?? "A colleague", from: t.starts_on, to: t.ends_on }),
      link: DESK_LINK,
    });
  } catch (e) {
    console.error("[nrs] notifyTravelReadyToBook failed", e);
  }
}
