import adminReviewService from "@/api/services/admin-review.service";
import { useQuery } from "@tanstack/react-query";

export const ADMIN_REVIEW_AUDITOR_FINDING_QUERY_KEY = "get-auditor-finding";

const useQueryAdminReviewAuditorFinding = (status: string = "submitted") => {
  return useQuery({
    queryKey: [ADMIN_REVIEW_AUDITOR_FINDING_QUERY_KEY, status],
    queryFn: () => adminReviewService.getAllAuthorFindings(status),
  });
};

export default useQueryAdminReviewAuditorFinding;
