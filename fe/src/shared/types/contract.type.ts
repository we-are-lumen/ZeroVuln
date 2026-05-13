export type ContractCode = {
    code: string
    line: number
}

export type AiMitigation = {
    name: string;
    reason: string;
    start_line: number;
    end_line: number;
}

export type AiFinding = {
    uuid: string;
    title: string;
    status: "open" | "closed" | string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    description: string;
    line_start: number;
    line_end: number;
    created_at: string;
    gas_saved: number | null;
    confidence: number | null;
    remediation: string | null;
    reasoning_trace: {
        mitigation: AiMitigation;
    };
}

export type ContractAudit = {
    kind: string
    uuid: string
    status: string
    started_at: string | null
    created_at: string
    ai_findings: AiFinding[]
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