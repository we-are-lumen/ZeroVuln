import contractService from "@/api/services/contracts.service";
import { useQuery } from "@tanstack/react-query";

export const CONTRACT_CATALOG_DETAIL_QUERY_KEY = "get-contract-catalog-detail";

const useQueryContractCatalogDetail = (id: string | null) => {
  return useQuery({
    queryKey: [CONTRACT_CATALOG_DETAIL_QUERY_KEY, id],
    queryFn: () => contractService.getCatalogDetail(id!),
    enabled: !!id,
  });
};

export default useQueryContractCatalogDetail;
