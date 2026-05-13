import adminReviewService from "@/api/services/admin-review.service";
import { useMutation } from "@tanstack/react-query";

export const useRejectAditorFinding = () => {
  return useMutation({
    mutationFn: (id: string) => adminReviewService.rejectAuditorFinding(id),
  });
};
