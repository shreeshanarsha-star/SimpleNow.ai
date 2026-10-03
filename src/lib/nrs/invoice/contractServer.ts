import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "../audit";
import { extractContractTerms } from "./contractAi";
import { NRS_BUCKET, dbCheck, HttpError } from "./kit";
import type { ContractDto, ContractStatus } from "./types";

export const CONTRACT_COLUMNS = "id, org_id, member_id, engagement_id, file_path, file_name, status, extraction, verified_at, created_at, is_demo";

export interface ContractRow {
  id: string;
  org_id: string;
  member_id: string;
  engagement_id: string | null;
  file_path: string | null;
  file_name: string | null;
  status: ContractStatus;
  extraction: ContractDto["extraction"];
  verified_at: string | null;
  created_at: string;
  is_demo: boolean;
}

export function toContractDto(r: ContractRow, memberName: string): ContractDto {
  return {
    id: r.id,
    member_id: r.member_id,
    member_name: memberName,
    file_name: r.file_name,
    status: r.status,
    extraction: r.extraction,
    verified_at: r.verified_at,
    created_at: r.created_at,
    is_demo: r.is_demo,
  };
}

export async function loadContract(admin: SupabaseClient, orgId: string, id: string): Promise<ContractRow> {
  const { data, error } = await admin
    .from("nrs_contracts")
    .select(CONTRACT_COLUMNS)
    .eq("id", id)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();
  dbCheck(error, "Contract");
  if (!data) throw new HttpError("Contract not found", 404);
  return data as ContractRow;
}

/** Download the contract PDF and run AI extraction; stores status review/failed. */
export async function runExtraction(admin: SupabaseClient, c: ContractRow, actorUser: string): Promise<ContractRow> {
  if (!c.file_path) throw new HttpError("This contract has no file to read", 409);
  await admin.from("nrs_contracts").update({ status: "extracting" }).eq("id", c.id);
  let status: ContractStatus = "review";
  let extraction: ContractRow["extraction"];
  try {
    const { data: blob, error } = await admin.storage.from(NRS_BUCKET).download(c.file_path);
    if (error || !blob) throw new Error(error?.message ?? "Couldn't read the stored file");
    extraction = await extractContractTerms(new Uint8Array(await blob.arrayBuffer()));
  } catch (e) {
    status = "failed";
    extraction = { error: e instanceof Error ? e.message : "Extraction failed" };
  }
  const { data, error } = await admin
    .from("nrs_contracts")
    .update({ status, extraction })
    .eq("id", c.id)
    .select(CONTRACT_COLUMNS)
    .single();
  dbCheck(error, "Saving extraction");
  await logAudit(admin, {
    orgId: c.org_id,
    actorUser,
    entity: "nrs_contracts",
    entityId: c.id,
    action: status === "review" ? "ai_extract" : "ai_extract_failed",
    after: status === "review" ? { status } : { status, error: (extraction as { error: string }).error },
  });
  return data as ContractRow;
}
