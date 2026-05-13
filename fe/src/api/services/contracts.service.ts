import { Contract } from "@/shared/types/contract.type"
import { api } from "../client"

const contractService = {
    getCatalog: async () => api.get<Contract[]>('contract_catalog').json(),
    getCatalogDetail: async (id: string) => api.get<Contract>(`contract_catalog/${id}`).json(),
    getAuditorFindings: async (id: string) => api.get<Contract>(`contract_catalog/${id}`).json(),
}

export default contractService