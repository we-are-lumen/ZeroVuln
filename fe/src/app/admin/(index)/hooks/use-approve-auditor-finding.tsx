import adminReviewService from "@/api/services/admin-review.service";
import { useMutation } from "@tanstack/react-query";

export const APPROVE_AUDITOR_FINDING_MUTATION_KEY = "approve-auditor-finding";

export const useApproveAditorFinding = () => {
  return useMutation({
    mutationKey: [APPROVE_AUDITOR_FINDING_MUTATION_KEY],
    mutationFn: (id: string) => adminReviewService.approveAuditorFinding(id),
  });
};
