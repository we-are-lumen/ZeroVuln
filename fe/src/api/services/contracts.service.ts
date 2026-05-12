import { Contract } from "@/shared/types/contract.type"
import { api } from "../client"

const contractService = {
    getCatalog: async () => api.get<Contract[]>('contract_catalog').json()
}

export default contractService