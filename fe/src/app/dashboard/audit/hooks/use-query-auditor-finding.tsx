import auditorFindingService from "@/api/services/auditor-findings.service";
import { useQuery } from "@tanstack/react-query";

export const AUDITOR_FINDING_QUERY_KEY = "get-auditor-finding";

const useQueryAuditorFinding = () => {
  return useQuery({
    queryKey: [AUDITOR_FINDING_QUERY_KEY],
    queryFn: () => auditorFindingService.getAll(),
  });
};

export default useQueryAuditorFinding;
