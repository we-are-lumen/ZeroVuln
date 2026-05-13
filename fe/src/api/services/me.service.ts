import { api } from "../client";
import type { Me, MeProfile } from "@/shared/types/me.type";

const meService = {
  getMe: async () => api.get<Me>("me").json(),
  getProfile: async () => api.get<MeProfile>("me/profile").json(),
};

export default meService;

