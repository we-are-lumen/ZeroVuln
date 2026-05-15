import { Contract } from "@/shared/types/contract.type"
import { api } from "../client"

type UpdateContractPayload = Partial<Pick<Contract, "name" | "status" | "hash_sc">> & {
    source_code?: unknown
    expired_at?: unknown
    language?: unknown
}

const contractService = {
    getContracts: async () => api.get<Contract[]>('contracts').json(),
    getContractDetail: async (id: string) => api.get<Contract>(`contracts/${id}`).json(),
    updateContract: async (id: string, payload: UpdateContractPayload) =>
        api.patch(`contracts/${id}`, { json: payload }).json<Contract>(),
    getCatalog: async () => api.get<Contract[]>('contract_catalog').json(),
    getCatalogDetail: async (id: string) => api.get<Contract>(`contract_catalog/${id}`).json(),
    getAuditorFindings: async (id: string) => api.get<Contract>(`contract_catalog/${id}`).json(),
}

export default contractService
