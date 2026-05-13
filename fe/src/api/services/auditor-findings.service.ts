import { AddAuditorFindingPayload, AuditorFinding } from "@/shared/types/auditor-finding.type"
import { api } from "../client"

const auditorFindingService = {
    getAll: async () => api.get<AuditorFinding[]>('auditor-findings').json(),
    add: async (payload: AddAuditorFindingPayload) => api.post('auditor-findings', { json: payload })
}

export default auditorFindingService