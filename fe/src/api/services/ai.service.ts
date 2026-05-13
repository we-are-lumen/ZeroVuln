import { GenerateContractPayload, GenerateContractResponse } from "@/shared/types/ai.type"
import { api } from "../client"

const aiService = {
    generateContract: async (payload: GenerateContractPayload) => api.post<GenerateContractResponse>('ai/ai-codegen', { json: payload }).json()
}

export default aiService