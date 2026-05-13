import adminReviewService from "@/api/services/admin-review.service";
import { useQuery } from "@tanstack/react-query";

export const ADMIN_REVIEW_AUDITOR_FINDING_QUERY_KEY = "get-auditor-finding";

const useQueryAdminReviewAuditorFinding = () => {
  return useQuery({
    queryKey: [ADMIN_REVIEW_AUDITOR_FINDING_QUERY_KEY],
    queryFn: () => adminReviewService.getAllAuthorFindings(),
  });
};

export default useQueryAdminReviewAuditorFinding;
