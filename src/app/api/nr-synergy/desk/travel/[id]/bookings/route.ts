import { randomUUID } from "node:crypto";
import { logAudit } from "@/lib/nrs/audit";
import { toMinor } from "@/lib/nrs/money";
import { HttpError, NRS_BUCKET, currency as parseCurrency, dbCheck, fileExt, isoDate, ok, oneOf, run, str, uploadPrivate, uuid } from "@/lib/nrs/invoice/kit";
import { guardDesk, loadTrip } from "@/app/tools/nr-synergy/desk/travel/_lib/server";
import { BOOKING_TYPES, toBookingDto, type StoredBooking } from "@/app/tools/nr-synergy/desk/travel/_lib/types";

export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_BOOKINGS = 20;

function field(form: FormData, key: string): string | null {
  const v = form.get(key);
  return typeof v === "string" ? v : null;
}

// POST /api/nr-synergy/desk/travel/:id/bookings  (multipart/form-data)
// fields: type, provider, reference?, from?, to?, starts_on, ends_on?, amount?, currency?, file?
// Adds a booking to an approved (or already booked) trip. File goes to
// nrs-private/{org}/travel/{requestId}/{bookingId}.{ext}.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return run(async () => {
    const g = await guardDesk();
    const { id: rawId } = await params;
    const id = uuid(rawId, "Travel request");

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new HttpError("Send the booking as a form");
    }

    const type = oneOf(field(form, "type"), BOOKING_TYPES, "Type");
    const provider = str(field(form, "provider"), "Provider", { max: 120 });
    const reference = str(field(form, "reference"), "Booking reference", { optional: true, max: 80 });
    const from = str(field(form, "from"), "From", { optional: true, max: 120 });
    const to = str(field(form, "to"), "To", { optional: true, max: 120 });
    const startsOn = isoDate(field(form, "starts_on"), "Start date");
    const endsOn = isoDate(field(form, "ends_on"), "End date", true);
    if (endsOn && endsOn < startsOn) throw new HttpError("The end date is before the start date");
    const amount = str(field(form, "amount"), "Amount", { optional: true, max: 30 });
    let amountMinor: number | null = null;
    let cur: string | null = null;
    if (amount) {
      cur = parseCurrency(field(form, "currency"));
      try {
        amountMinor = toMinor(amount, cur);
      } catch {
        throw new HttpError("Amount must be a number");
      }
      if (amountMinor < 0) throw new HttpError("Amount can't be negative");
    }

    const file = form.get("file");
    const upload = file instanceof File && file.size > 0 ? file : null;
    let ext: string | null = null;
    if (upload) {
      if (upload.size > MAX_FILE_BYTES) throw new HttpError("The file is larger than 10 MB", 413);
      ext = fileExt(upload);
      if (!ext) throw new HttpError("Use a PDF, JPG, PNG, WebP or HEIC file", 415);
    }

    const trip = await loadTrip(g.admin, g.orgId, id);
    if (trip.status !== "approved" && trip.status !== "booked") {
      throw new HttpError("Only approved trips can be booked", 409);
    }
    if (trip.bookingsParsed.length >= MAX_BOOKINGS) throw new HttpError(`A trip can have at most ${MAX_BOOKINGS} bookings`);

    const bookingId = randomUUID();
    let filePath: string | null = null;
    if (upload && ext) {
      filePath = `${g.orgId}/travel/${id}/${bookingId}.${ext}`;
      await uploadPrivate(g.admin, filePath, upload, upload.type);
    }

    const booking: StoredBooking = {
      id: bookingId,
      type,
      provider,
      reference,
      from,
      to,
      starts_on: startsOn,
      ends_on: endsOn,
      amount_minor: amountMinor,
      currency: cur,
      file_path: filePath,
      file_name: upload ? upload.name.slice(0, 160) : null,
      added_by_member: g.memberId,
      added_at: new Date().toISOString(),
    };
    const next = [...trip.bookingsParsed, booking];

    // Guarded on the status we read so a concurrent cancel isn't overwritten.
    const { data: updated, error } = await g.admin
      .from("nrs_travel_requests")
      .update({ bookings: next })
      .eq("id", id)
      .eq("org_id", g.orgId)
      .eq("status", trip.status)
      .select("id");
    if (error || !updated || (updated as unknown[]).length === 0) {
      if (filePath) await g.admin.storage.from(NRS_BUCKET).remove([filePath]);
      dbCheck(error, "Saving booking");
      throw new HttpError("This trip changed while you were editing. Reload and try again.", 409);
    }

    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_travel_requests",
      entityId: id,
      action: "booking_add",
      after: { booking_id: bookingId, type, provider, reference, starts_on: startsOn, ends_on: endsOn, amount_minor: amountMinor, currency: cur, has_file: !!filePath },
    });
    return ok({ booking: toBookingDto(booking) }, 201);
  });
}
