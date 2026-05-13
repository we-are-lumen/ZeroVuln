import { Contract } from "./contract.type"

export type AuditorFindingSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical'

export type AuditorFinding = {
    id: number
    uuid: string
    contributor_id: number
    contract_id: number
    severity: AuditorFindingSeverity
    title: string
    description: string
    review_status: string
    submitted_at: string | null
    line_start: number
    line_end: number
    dataset_uri: string
    dataset_hash: string
    contracts: Pick<Contract, 'uuid' | 'name' | 'language' | 'is_catalog'>
    decided_at: string
    created_at: string
    updated_at: string
}

export type AddAuditorFindingPayload = {
    contract_id: string
    title: string
    severity: AuditorFindingSeverity
    description: string
    line_start: number
    line_end: number
}

export type AdminReviewAuditorFinding = AuditorFinding & { users: { id: number, wallet_address: string } }