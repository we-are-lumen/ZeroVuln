export type ContractCode = {
    code: string
    line: number
}

export interface AttackTraceNode {
    id: string;
    type: "Contract" | "Function" | "EOA" | string;
    label: string;
    address: string;
}
export interface AttackTraceEdge {
    from: string;
    to: string;
    action: string;
    status: "re-entrant" | "success" | "reverted" | string;
}

export interface AttackTraceMetadata {
    confidence: number;
    blockNumber: number;
    vulnerability: string;
    steps?: AttackTraceStep[];
}

export interface AttackTraceStep {
    step: number;
    title: string;
    description: string;
    from?: string;
    to?: string;
    action?: string;
}
export interface AttackTrace {
    traceId: string;
    nodes: AttackTraceNode[];
    edges: AttackTraceEdge[];
    metadata: AttackTraceMetadata;
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
    remediation: unknown | null;
    reasoning_trace: {
        mitigation: AiMitigation;
    };
    attack_trace: AttackTrace
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
    hash_sc?: string | null
    gas_eslimate: number | null
    reward_per_finding: number
    is_catalog: boolean
    source_code: ContractCode[]
    audits?: ContractAudit[]
    created_at: string
    updated_at: string
    expired_at: string
}
