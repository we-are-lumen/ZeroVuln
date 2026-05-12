import contractService from "@/api/services/contracts.service";
import { useQuery } from "@tanstack/react-query";

export const CONTRACT_CATALOG_QUERY_KEY = "get-contract-catalog";

const useQueryContractCatalog = () => {
  return useQuery({
    queryKey: [CONTRACT_CATALOG_QUERY_KEY],
    queryFn: () => contractService.getCatalog(),
  });
};

export default useQueryContractCatalog;
