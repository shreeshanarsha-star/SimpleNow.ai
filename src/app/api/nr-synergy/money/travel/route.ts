import { createRequest } from "@/lib/nrs/approvals";
import { logAudit } from "@/lib/nrs/audit";
import { toMinor } from "@/lib/nrs/money";
import { HttpError, currency as parseCurrency, dbCheck, guardMember, isoDate, ok, readJson, run, str } from "@/lib/nrs/invoice/kit";
import type { TravelDto } from "@/lib/nrs/invoice/types";

export const dynamic = "force-dynamic";

const COLUMNS = "id, destination, purpose, starts_on, ends_on, estimated_minor, currency, status, created_at";

function toDto(r: TravelDto & { estimated_minor: number | string | null }): TravelDto {
  return { ...r, estimated_minor: r.estimated_minor == null ? null : Number(r.estimated_minor) };
}

export async function GET() {
  return run(async () => {
    const g = await guardMember("money");
    const { data, error } = await g.admin
      .from("nrs_travel_requests")
      .select(COLUMNS)
      .eq("member_id", g.member.id)
      .order("starts_on", { ascending: false })
      .limit(100);
    dbCheck(error, "Travel requests");
    return ok({ travel: ((data ?? []) as TravelDto[]).map(toDto) });
  });
}

// POST {destination, purpose, starts_on, ends_on, estimated?, currency?}
export async function POST(req: Request) {
  return run(async () => {
    const g = await guardMember("money");
    const b = await readJson(req);
    const destination = str(b.destination, "Destination", { max: 200 });
    const purpose = str(b.purpose, "Purpose", { max: 1000 });
    const startsOn = isoDate(b.starts_on, "Start date");
    const endsOn = isoDate(b.ends_on, "End date");
    if (endsOn < startsOn) throw new HttpError("The end date is before the start date");
    const estimated = str(b.estimated, "Estimated cost", { optional: true, max: 30 });
    let estimatedMinor: number | null = null;
    let cur: string | null = null;
    if (estimated) {
      cur = parseCurrency(b.currency);
      try {
        estimatedMinor = toMinor(estimated, cur);
      } catch {
        throw new HttpError("Estimated cost must be a number");
      }
      if (estimatedMinor < 0) throw new HttpError("Estimated cost can't be negative");
    }

    const { data, error } = await g.admin
      .from("nrs_travel_requests")
      .insert({
        org_id: g.orgId,
        member_id: g.member.id,
        destination,
        purpose,
        starts_on: startsOn,
        ends_on: endsOn,
        estimated_minor: estimatedMinor,
        currency: cur,
        status: "pending",
      })
      .select(COLUMNS)
      .single();
    dbCheck(error, "Saving travel request");
    const row = data as TravelDto;
    try {
      await createRequest("travel", row.id, g.member.id, `Travel: ${destination} (${startsOn} to ${endsOn})`, estimatedMinor, cur, {
        admin: g.admin,
        createdBy: g.user.id,
        summary: purpose.slice(0, 300),
      });
    } catch (e) {
      await g.admin.from("nrs_travel_requests").delete().eq("id", row.id);
      throw e;
    }
    await logAudit(g.admin, {
      orgId: g.orgId,
      actorUser: g.user.id,
      entity: "nrs_travel_requests",
      entityId: row.id,
      action: "create",
      after: { destination, starts_on: startsOn, ends_on: endsOn, estimated_minor: estimatedMinor, currency: cur },
    });
    const { data: fresh } = await g.admin.from("nrs_travel_requests").select(COLUMNS).eq("id", row.id).single();
    return ok({ travel: toDto((fresh ?? row) as TravelDto) }, 201);
  });
}
