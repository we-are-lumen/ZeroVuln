import contractService from "@/api/services/contracts.service";
import { useQuery } from "@tanstack/react-query";

export const CONTRACT_QUERY_KEY = "get-contracts";

const useQueryContract = () => {
  return useQuery({
    queryKey: [CONTRACT_QUERY_KEY],
    queryFn: () => contractService.getContracts(),
  });
};

export default useQueryContract;
