import { AdminReviewAuditorFinding } from "@/shared/types/auditor-finding.type"
import { api } from "../client"

const adminReviewService = {
    getAllAuthorFindings: async (status?: string) =>
        api.get<AdminReviewAuditorFinding[]>('admin/auditor-findings', {
            searchParams: status && status !== 'all' ? { review_status: status } : undefined
        }).json(),
    approveAuditorFinding: async (id: string) => api.post<AdminReviewAuditorFinding>(`admin/auditor-findings/${id}/approve`).json(),
    rejectAuditorFinding: async (id: string) => api.post<AdminReviewAuditorFinding>(`admin/auditor-findings/${id}/reject`).json(),

}

export default adminReviewService