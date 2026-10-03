// DTOs for /api/nr-synergy/admin/assets (client-safe).

export const ASSET_KINDS = ["laptop", "phone", "sim", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_STATUSES = ["in_stock", "issued", "returned", "lost"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export interface AssetDto {
  id: string;
  kind: AssetKind;
  model: string | null;
  serial: string | null;
  status: AssetStatus;
  assigned_member_id: string | null;
  issued_on: string | null;
  returned_on: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface AssetMemberDto {
  id: string;
  full_name: string;
  email: string;
  status: "active" | "inactive";
}

export interface AssetsData {
  assets: AssetDto[];
  members: AssetMemberDto[];
}

export interface AssetImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

export const ASSET_COLUMNS = "id, kind, model, serial, status, assigned_member_id, issued_on, returned_on, notes, is_demo, created_at, updated_at";
