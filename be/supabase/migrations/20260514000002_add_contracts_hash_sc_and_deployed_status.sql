-- Add deployed status and deployment tx hash to contracts

do $$
begin
  -- Add a new enum value (Postgres supports IF NOT EXISTS on newer versions; keep defensive block)
  begin
    alter type contract_status add value if not exists 'deployed';
  exception
    when duplicate_object then
      null;
  end;
end $$;

alter table if exists public.contracts
  add column if not exists hash_sc text;

