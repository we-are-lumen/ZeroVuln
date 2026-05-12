export type ContractCode = {
    code: string
    line: number
}

export type Contract = {
    uuid: string
    language: string
    name: string
    gas_eslimate: number | null
    reward_per_finding: number
    source_code: ContractCode[]
    created_at: string
    expired_at: string
}