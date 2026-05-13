"use client";

import contractCatalogAdminService, {
  UpdateCatalogContractPayload,
  UpsertCatalogContractPayload,
} from "@/api/services/contract-catalog-admin.service";
import { ADMIN_CONTRACT_CATALOG_QUERY_KEY } from "./use-query-admin-contract-catalog";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useCreateAdminContractCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpsertCatalogContractPayload) =>
      contractCatalogAdminService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [ADMIN_CONTRACT_CATALOG_QUERY_KEY],
      });
    },
  });
}

export function useUpdateAdminContractCatalog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { uuid: string; payload: UpdateCatalogContractPayload }) =>
      contractCatalogAdminService.update(params.uuid, params.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [ADMIN_CONTRACT_CATALOG_QUERY_KEY],
      });
    },
  });
}

