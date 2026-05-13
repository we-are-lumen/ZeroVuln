import { api } from "../client";
import type { Contract } from "@/shared/types/contract.type";

export type UpsertCatalogContractPayload = {
  name?: string;
  source_code: Array<{ line: number; code: string; path?: string }>;
  language?: string;
  expired_at?: string | null;
  reward_per_finding?: number;
};

export type UpdateCatalogContractPayload = Partial<UpsertCatalogContractPayload>;

const contractCatalogAdminService = {
  getAll: async () => api.get<Contract[]>("contract_catalog/admin").json(),
  getDetail: async (uuid: string) =>
    api.get<Contract>(`contract_catalog/admin/${uuid}`).json(),
  create: async (payload: UpsertCatalogContractPayload) =>
    api.post("contract_catalog/admin", { json: payload }).json<Contract>(),
  update: async (uuid: string, payload: UpdateCatalogContractPayload) =>
    api.patch(`contract_catalog/admin/${uuid}`, { json: payload }).json<Contract>(),
};

export default contractCatalogAdminService;

