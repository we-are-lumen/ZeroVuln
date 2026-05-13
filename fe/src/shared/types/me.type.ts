export type Me = {
  id: number;
  uuid: string;
  wallet_address: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfileAuditorFinding = {
  uuid: string;
  contract_id: number;
  severity: "info" | "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  review_status: string;
  submitted_at: string | null;
  decided_at: string | null;
  line_start: number | null;
  line_end: number | null;
  dataset_uri: string | null;
  dataset_hash: string | null;
  reward_amount: number | null;
  created_at: string;
  updated_at: string;
};

export type MeProfile = {
  uuid: string;
  wallet_address: string;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
  auditor_findings: ProfileAuditorFinding[];
};

