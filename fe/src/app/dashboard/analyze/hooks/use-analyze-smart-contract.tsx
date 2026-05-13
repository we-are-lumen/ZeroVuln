"use client";

import aiService from "@/api/services/ai.service";
import { AnalyzeContractPayload } from "@/shared/types/ai.type";
import { useMutation } from "@tanstack/react-query";

export default function useAnalyzeSmartContract() {
  return useMutation({
    mutationFn: (payload: AnalyzeContractPayload) => aiService.analyzeContract(payload),
  });
}

