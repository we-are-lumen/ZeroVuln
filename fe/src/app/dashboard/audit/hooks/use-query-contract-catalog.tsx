import contractService from "@/api/services/contracts.service";
import { useQuery } from "@tanstack/react-query";

const useQueryContractCatalog = () => {
  return useQuery({
    queryKey: ["get-contract-catalog"],
    queryFn: () => contractService.getCatalog(),
  });
};

export default useQueryContractCatalog;
