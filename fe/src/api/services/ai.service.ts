import {
  GenerateContractPayload,
  GenerateContractResponse,
  AnalyzeContractPayload,
  AnalyzeContractResponse,
} from "@/shared/types/ai.type"
import { api } from "../client"

const aiService = {
    generateContract: async (payload: GenerateContractPayload) => api.post<GenerateContractResponse>('ai/ai-codegen', { json: payload }).json(),
    analyzeContract: async (payload: AnalyzeContractPayload) => api.post<AnalyzeContractResponse>('ai/ai-audit', { json: payload }).json(),
}

export default aiService
