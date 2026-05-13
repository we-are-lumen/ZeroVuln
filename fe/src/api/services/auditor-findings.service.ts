import { AuditorFinding } from "@/shared/types/auditor-finding.type"
import { api } from "../client"

const auditorFindingService = {
    getAll: async () => api.get<AuditorFinding[]>('auditor-findings').json(),
}

export default auditorFindingService