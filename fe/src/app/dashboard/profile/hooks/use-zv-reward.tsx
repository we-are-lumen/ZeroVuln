"use client";

import { claimReward, getClaimableRewardWei } from "@/shared/lib/zv-contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const ZV_CLAIMABLE_REWARD_QUERY_KEY = "zv-claimable-reward";

export function useQueryZvClaimableReward(walletAddress: string | null) {
  return useQuery({
    queryKey: [ZV_CLAIMABLE_REWARD_QUERY_KEY, walletAddress],
    queryFn: () => getClaimableRewardWei(walletAddress as string),
    enabled: Boolean(walletAddress),
  });
}

export function useClaimZvReward(walletAddress: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => claimReward(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [ZV_CLAIMABLE_REWARD_QUERY_KEY, walletAddress],
      });
    },
  });
}

