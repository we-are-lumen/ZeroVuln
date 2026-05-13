export type GenerateContractPayload = {
    prompt: string
    contract_id?: string
}

export type GeneratedCodeMitigation = {
    name: string
    reason: string
    start_line: number
    end_line: number
}

export type GenerateContractResponse = {
    contract_id: string
    audit_id: string
    generated_code: string
    mitigation: GeneratedCodeMitigation[]
}