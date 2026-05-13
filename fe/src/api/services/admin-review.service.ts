import { AdminReviewAuditorFinding } from "@/shared/types/auditor-finding.type"
import { api } from "../client"

const adminReviewService = {
    getAllAuthorFindings: async () => api.get<AdminReviewAuditorFinding[]>('admin/auditor-findings').json(),
}

export default adminReviewService