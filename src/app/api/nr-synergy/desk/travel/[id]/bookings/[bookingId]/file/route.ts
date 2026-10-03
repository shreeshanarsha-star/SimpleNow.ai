import { logAudit } from "@/lib/nrs/audit";
import { HttpError, ok, run, signedUrlInOrg, uuid } from "@/lib/nrs/invoice/kit";
import { guardDesk, loadTrip } from "@/app/tools/nr-synergy/desk/travel/_lib/server";

export const dynamic = "force-dynamic";

// GET /api/nr-synergy/desk/travel/:id/bookings/:bookingId/file -> { url } (short-lived signed URL)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; bookingId: string }> }) {
  return run(async () => {
    const g = await guardDesk();
    const p = await params;
    const id = uuid(p.id, "Travel request");
    const bookingId = uuid(p.bookingId, "Booking");
    const trip = await loadTrip(g.admin, g.orgId, id);
    const booking = trip.bookingsParsed.find((b) => b.id === bookingId);
    if (!booking?.file_path || !booking.file_path.startsWith(`${g.orgId}/travel/${id}/`)) throw new HttpError("No document on this booking", 404);
    const url = await signedUrlInOrg(g.admin, g.orgId, booking.file_path, booking.file_name ?? undefined);
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_travel_requests",
      entityId: id,
      action: "booking_file_view",
      context: { booking_id: bookingId },
    });
    return ok({ url });
  });
}
