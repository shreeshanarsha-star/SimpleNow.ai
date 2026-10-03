import { logAudit } from "@/lib/nrs/audit";
import { HttpError, dbCheck, guard, ok, readJson, run, todayIso } from "@/lib/nrs/invoice/kit";
import { parseCsv } from "../_csv";
import { ASSET_KINDS, type AssetImportResult, type AssetKind } from "../_types";

export const dynamic = "force-dynamic";

const MAX_BYTES = 1_000_000;
const MAX_ROWS = 2000;
const COLUMNS = ["kind", "model", "serial", "assigned_email", "issued_on", "notes"] as const;

// POST { csv }: import assets. Columns kind,model,serial,assigned_email,issued_on,notes
// (header row required, any order). Valid rows are added; every invalid row is
// reported with its line number and nothing is written for it. HR only.
export async function POST(req: Request) {
  return run(async () => {
    const g = await guard(undefined, "hr");
    const b = await readJson(req);
    const csv = typeof b.csv === "string" ? b.csv : "";
    if (!csv.trim()) throw new HttpError("The CSV is empty");
    if (csv.length > MAX_BYTES) throw new HttpError("The CSV is too large (1 MB max)");

    const table = parseCsv(csv);
    if (!table.length) throw new HttpError("The CSV is empty");
    const header = table[0].cells.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
    const col = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)])) as Record<(typeof COLUMNS)[number], number>;
    if (col.kind < 0) throw new HttpError(`Missing header row. Expected columns: ${COLUMNS.join(", ")}`);
    const rows = table.slice(1).filter((r) => r.cells.some((c) => c.trim()));
    if (!rows.length) throw new HttpError("The CSV has a header but no rows");
    if (rows.length > MAX_ROWS) throw new HttpError(`Too many rows (${MAX_ROWS} max per import)`);

    // Look-ups: members by email, serials already in use.
    const [membersRes, serialsRes] = await Promise.all([
      g.admin.from("nrs_members").select("id, email, status").eq("org_id", g.orgId).is("deleted_at", null),
      g.admin.from("nrs_assets").select("serial").eq("org_id", g.orgId).not("serial", "is", null),
    ]);
    dbCheck(membersRes.error, "Members");
    dbCheck(serialsRes.error, "Assets");
    const members = new Map(
      ((membersRes.data ?? []) as { id: string; email: string; status: string }[]).map((m) => [m.email.toLowerCase(), m])
    );
    const takenSerials = new Set(((serialsRes.data ?? []) as { serial: string }[]).map((r) => r.serial.toLowerCase()));

    const errors: AssetImportResult["errors"] = [];
    const inserts: Record<string, unknown>[] = [];
    const today = todayIso();
    const cell = (cells: string[], i: number) => (i >= 0 ? (cells[i] ?? "").trim() : "");

    for (const r of rows) {
      const problems: string[] = [];
      const kindRaw = cell(r.cells, col.kind).toLowerCase();
      const kind = (ASSET_KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as AssetKind) : null;
      if (!kind) problems.push(kindRaw ? `kind "${kindRaw}" must be laptop, phone, sim or other` : "kind is required");

      const model = cell(r.cells, col.model) || null;
      if (model && model.length > 200) problems.push("model is too long (200 max)");
      const serial = cell(r.cells, col.serial) || null;
      if (serial && serial.length > 120) problems.push("serial is too long (120 max)");
      if (serial && takenSerials.has(serial.toLowerCase())) problems.push(`serial ${serial} already exists`);
      const notes = cell(r.cells, col.notes) || null;
      if (notes && notes.length > 2000) problems.push("notes are too long (2000 max)");

      const email = cell(r.cells, col.assigned_email).toLowerCase();
      let memberId: string | null = null;
      if (email) {
        const m = members.get(email);
        if (!m) problems.push(`no member with email ${email}`);
        else if (m.status !== "active") problems.push(`${email} is not an active member`);
        else memberId = m.id;
      }

      const issuedRaw = cell(r.cells, col.issued_on);
      let issuedOn: string | null = null;
      if (issuedRaw) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedRaw) || Number.isNaN(Date.parse(`${issuedRaw}T00:00:00Z`))) {
          problems.push(`issued_on "${issuedRaw}" must be a date (yyyy-mm-dd)`);
        } else issuedOn = issuedRaw;
      }

      if (problems.length) {
        errors.push({ row: r.line, message: problems.join("; ") });
        continue;
      }
      if (serial) takenSerials.add(serial.toLowerCase()); // duplicates later in the same file
      inserts.push({
        org_id: g.orgId,
        kind,
        model,
        serial,
        notes,
        assigned_member_id: memberId,
        status: memberId ? "issued" : "in_stock",
        issued_on: memberId ? issuedOn ?? today : issuedOn,
      });
    }

    let created = 0;
    if (inserts.length) {
      const { data, error } = await g.admin.from("nrs_assets").insert(inserts).select("id");
      dbCheck(error, "Importing assets");
      created = (data ?? []).length;
      await logAudit(g.admin, {
        orgId: g.orgId,
        actorUser: g.user.id,
        entity: "nrs_assets",
        action: "import",
        context: { created, rejected: errors.length, rows: rows.length },
      });
    }
    return ok<AssetImportResult>({ created, errors });
  });
}
