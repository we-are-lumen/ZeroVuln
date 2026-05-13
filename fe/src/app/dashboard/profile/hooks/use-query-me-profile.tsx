"use client";

import meService from "@/api/services/me.service";
import { useQuery } from "@tanstack/react-query";

export const ME_PROFILE_QUERY_KEY = "get-me-profile";

export default function useQueryMeProfile() {
  return useQuery({
    queryKey: [ME_PROFILE_QUERY_KEY],
    queryFn: () => meService.getProfile(),
  });
}

