import { logAudit } from "@/lib/nrs/audit";
import { HttpError, NRS_BUCKET, dbCheck, ok, run, uuid } from "@/lib/nrs/invoice/kit";
import { guardDesk, loadTrip } from "@/app/tools/nr-synergy/desk/travel/_lib/server";

export const dynamic = "force-dynamic";

// DELETE /api/nr-synergy/desk/travel/:id/bookings/:bookingId
// Removes a booking (and its file) while the trip is approved but not yet booked.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; bookingId: string }> }) {
  return run(async () => {
    const g = await guardDesk();
    const p = await params;
    const id = uuid(p.id, "Travel request");
    const bookingId = uuid(p.bookingId, "Booking");

    const trip = await loadTrip(g.admin, g.orgId, id);
    if (trip.status !== "approved") throw new HttpError("Bookings can only be removed before the trip is marked booked", 409);
    const target = trip.bookingsParsed.find((b) => b.id === bookingId);
    if (!target) throw new HttpError("Booking not found", 404);

    const { data: updated, error } = await g.admin
      .from("nrs_travel_requests")
      .update({ bookings: trip.bookingsParsed.filter((b) => b.id !== bookingId) })
      .eq("id", id)
      .eq("org_id", g.orgId)
      .eq("status", "approved")
      .select("id");
    dbCheck(error, "Removing booking");
    if (!updated || (updated as unknown[]).length === 0) throw new HttpError("This trip changed. Reload and try again.", 409);

    if (target.file_path && target.file_path.startsWith(`${g.orgId}/travel/${id}/`)) {
      const { error: rmErr } = await g.admin.storage.from(NRS_BUCKET).remove([target.file_path]);
      if (rmErr) console.error("[nrs] travel booking file remove failed", rmErr.message);
    }

    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_travel_requests",
      entityId: id,
      action: "booking_remove",
      before: { booking_id: bookingId, type: target.type, provider: target.provider, reference: target.reference },
    });
    return ok({ ok: true });
  });
}
