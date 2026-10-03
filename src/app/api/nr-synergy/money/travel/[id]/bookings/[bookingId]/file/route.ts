import { HttpError, dbCheck, guardMember, ok, run, signedUrlInOrg, uuid } from "@/lib/nrs/invoice/kit";
import { parseBookings } from "@/app/tools/nr-synergy/desk/travel/_lib/types";

export const dynamic = "force-dynamic";

// GET /api/nr-synergy/money/travel/:id/bookings/:bookingId/file -> { url }
// The traveller's own booking document (ticket / voucher), as a short-lived signed URL.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; bookingId: string }> }) {
  return run(async () => {
    const g = await guardMember("money");
    const p = await params;
    const id = uuid(p.id, "Travel request");
    const bookingId = uuid(p.bookingId, "Booking");
    const { data, error } = await g.admin
      .from("nrs_travel_requests")
      .select("bookings")
      .eq("id", id)
      .eq("org_id", g.orgId)
      .eq("member_id", g.member.id)
      .maybeSingle();
    dbCheck(error, "Travel request");
    if (!data) throw new HttpError("Travel request not found", 404);
    const booking = parseBookings((data as { bookings: unknown }).bookings).find((b) => b.id === bookingId);
    if (!booking?.file_path || !booking.file_path.startsWith(`${g.orgId}/travel/${id}/`)) throw new HttpError("No document on this booking", 404);
    return ok({ url: await signedUrlInOrg(g.admin, g.orgId, booking.file_path, booking.file_name ?? undefined) });
  });
}
