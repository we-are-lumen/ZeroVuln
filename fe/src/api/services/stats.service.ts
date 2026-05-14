import { PublicStats } from "@/shared/types/stats.type"
import { api } from "../client"

const statsService = {
    getAll: async () => api.get<PublicStats>('public-stats').json(),
}

export default statsService