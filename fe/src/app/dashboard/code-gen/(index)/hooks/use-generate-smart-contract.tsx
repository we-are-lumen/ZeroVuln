import aiService from "@/api/services/ai.service";
import { GenerateContractPayload } from "@/shared/types/ai.type";
import { useMutation } from "@tanstack/react-query";

export const useGenerateSmartContract = () => {
  return useMutation({
    mutationFn: (payload: GenerateContractPayload) =>
      aiService.generateContract(payload),
  });
};
