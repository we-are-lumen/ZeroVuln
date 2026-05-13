import auditorFindingService from "@/api/services/auditor-findings.service";
import { AddAuditorFindingPayload } from "@/shared/types/auditor-finding.type";
import { useMutation } from "@tanstack/react-query";

export const useAddAuditorFinding = () => {
  return useMutation({
    mutationFn: (payload: AddAuditorFindingPayload) =>
      auditorFindingService.add(payload),
  });
};
