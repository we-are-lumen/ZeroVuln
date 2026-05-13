"use client";

import { fundContract, getContractBalanceWei } from "@/shared/lib/zv-contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const ZV_TREASURY_BALANCE_QUERY_KEY = "zv-treasury-balance";

export function useQueryZvTreasuryBalance() {
  return useQuery({
    queryKey: [ZV_TREASURY_BALANCE_QUERY_KEY],
    queryFn: () => getContractBalanceWei(),
    refetchInterval: 10_000,
  });
}

export function useFundZvTreasury() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (amount0g: string) => fundContract(amount0g),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ZV_TREASURY_BALANCE_QUERY_KEY] });
    },
  });
}

