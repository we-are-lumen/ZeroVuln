"use client";

import contractCatalogAdminService from "@/api/services/contract-catalog-admin.service";
import { useQuery } from "@tanstack/react-query";

export const ADMIN_CONTRACT_CATALOG_QUERY_KEY = "admin-contract-catalog";

export default function useQueryAdminContractCatalog() {
  return useQuery({
    queryKey: [ADMIN_CONTRACT_CATALOG_QUERY_KEY],
    queryFn: () => contractCatalogAdminService.getAll(),
  });
}

