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

export type AnalyzeContractPayload = {
    code: string
    prompt?: string
    contract_id?: string
}

export type AnalyzeContractFinding = {
    uuid: string
    severity: "info" | "low" | "medium" | "high" | "critical" | string
    title: string
    description: string
    line_start?: number | null
    line_end?: number | null
    confidence?: number | null
    status?: string
}

export type AnalyzeContractResponse = {
    contract_id: string
    audit_id: string
    code_fixed: string
    findings: AnalyzeContractFinding[]
}
