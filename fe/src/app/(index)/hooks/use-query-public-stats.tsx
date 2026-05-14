import statsService from "@/api/services/stats.service";
import { useQuery } from "@tanstack/react-query";

export const PUBLIC_STATS_QUERY_KEY = "get-public-stats";

const useQueryPublicStats = () => {
  return useQuery({
    queryKey: [PUBLIC_STATS_QUERY_KEY],
    queryFn: () => statsService.getAll(),
  });
};

export default useQueryPublicStats;
