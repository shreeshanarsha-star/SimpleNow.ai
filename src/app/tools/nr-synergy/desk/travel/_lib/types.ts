// Travel request + booking types shared by the Money travel panel, the travel
// desk page and their API routes (client-safe: no server imports).

export const BOOKING_TYPES = ["flight", "hotel", "car", "other"] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

export type TravelRequestStatus = "pending" | "approved" | "booked" | "rejected" | "sent_back" | "cancelled";

/** One element of nrs_travel_requests.bookings (jsonb) as stored. */
export interface StoredBooking {
  id: string;
  type: BookingType;
  provider: string;
  reference: string | null;
  from: string | null;
  to: string | null;
  starts_on: string;
  ends_on: string | null;
  amount_minor: number | null;
  currency: string | null;
  file_path: string | null;
  file_name: string | null;
  added_by_member: string | null;
  added_at: string;
}

/** Booking as sent to browsers (no storage path). */
export type BookingDto = Omit<StoredBooking, "file_path"> & { has_file: boolean };

export interface ChainStepDto {
  step_no: number;
  approver_type: "manager" | "role" | "member";
  approver_role: string | null;
  approver_name: string | null;
  status: string;
  decided_at: string | null;
  decided_by: string | null;
  comment: string | null;
}

export interface TravelItemDto {
  id: string;
  destination: string;
  purpose: string;
  starts_on: string;
  ends_on: string;
  estimated_minor: number | null;
  currency: string | null;
  status: TravelRequestStatus;
  created_at: string;
  booked_at: string | null;
  booked_by_name: string | null;
  bookings: BookingDto[];
  chain: ChainStepDto[];
}

export function isBookingType(v: unknown): v is BookingType {
  return typeof v === "string" && (BOOKING_TYPES as readonly string[]).includes(v);
}

/** Parse the jsonb column defensively (rows written before bookings existed are []). */
export function parseBookings(raw: unknown): StoredBooking[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (b): b is StoredBooking =>
      !!b && typeof b === "object" && typeof (b as StoredBooking).id === "string" && isBookingType((b as StoredBooking).type)
  );
}

export function toBookingDto(b: StoredBooking): BookingDto {
  const { file_path, ...rest } = b;
  return { ...rest, has_file: !!file_path };
}
