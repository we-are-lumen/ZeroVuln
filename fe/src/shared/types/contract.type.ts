export type ContractCode = {
    code: string
    line: number
}

export type ContractAudit = {
    kind: string
    uuid: string
    status: string
    created_at: string
}

export type Contract = {
    uuid: string
    language: string
    name: string
    status: string
    gas_eslimate: number | null
    reward_per_finding: number
    is_catalog: boolean
    source_code: ContractCode[]
    audits?: ContractAudit[]
    created_at: string
    updated_at: string
    expired_at: string
}