import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, ok, run, uuid } from "@/lib/nrs/invoice/kit";
import { guardDesk, loadTrip, notifyTripBooked } from "@/app/tools/nr-synergy/desk/travel/_lib/server";

export const dynamic = "force-dynamic";

// POST /api/nr-synergy/desk/travel/:id/book
// Marks an approved trip with at least one booking as booked and notifies the traveller.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guardDesk();
    const { id: rawId } = await params;
    const id = uuid(rawId, "Travel request");

    const trip = await loadTrip(g.admin, g.orgId, id);
    if (trip.status === "booked") throw new HttpError("This trip is already booked", 409);
    if (trip.status !== "approved") throw new HttpError("Only approved trips can be marked booked", 409);
    if (!trip.bookingsParsed.length) throw new HttpError("Add at least one booking first");

    const bookedAt = new Date().toISOString();
    const { data: updated, error } = await g.admin
      .from("nrs_travel_requests")
      .update({ status: "booked", booked_by_member: g.memberId, booked_at: bookedAt })
      .eq("id", id)
      .eq("org_id", g.orgId)
      .eq("status", "approved")
      .select("id");
    dbCheck(error, "Marking booked");
    if (!updated || (updated as unknown[]).length === 0) throw new HttpError("This trip changed. Reload and try again.", 409);

    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_travel_requests",
      entityId: id,
      action: "booked",
      before: { status: "approved" },
      after: { status: "booked", booked_by_member: g.memberId, booked_at: bookedAt, bookings: trip.bookingsParsed.length },
    });
    await notifyTripBooked(g.admin, trip, trip.bookingsParsed.length);
    return ok({ status: "booked", booked_at: bookedAt });
  });
}
