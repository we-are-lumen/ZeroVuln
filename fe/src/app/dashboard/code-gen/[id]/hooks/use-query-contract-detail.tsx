import contractService from "@/api/services/contracts.service";
import { useQuery } from "@tanstack/react-query";

export const CONTRACT_DETAIL_QUERY_KEY = "get-contract-detail";

const useQueryContractDetail = (id: string) => {
  return useQuery({
    queryKey: [CONTRACT_DETAIL_QUERY_KEY],
    queryFn: () => contractService.getContractDetail(id),
  });
};

export default useQueryContractDetail;
