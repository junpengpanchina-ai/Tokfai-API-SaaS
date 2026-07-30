-- P982 — Per-API-key trial quota / commercial risk-control columns
-- Defaults keep existing keys unrestricted (trial_mode=false, limits null → env globals).

alter table public.api_keys
  add column if not exists trial_mode boolean not null default false;

alter table public.api_keys
  add column if not exists trial_credits_limit numeric null;

alter table public.api_keys
  add column if not exists daily_credit_limit numeric null;

alter table public.api_keys
  add column if not exists monthly_credit_limit numeric null;

comment on column public.api_keys.trial_mode is
  'P982: when true, key is limited to TOKFAI_TRIAL_ALLOWED_MODELS and trial_credits_limit.';

comment on column public.api_keys.trial_credits_limit is
  'P982: lifetime charged-credits cap for this key when trial_mode (null → env default).';

comment on column public.api_keys.daily_credit_limit is
  'P982: optional per-key daily charged-credits cap (null → TOKFAI_DAILY_CREDIT_LIMIT).';

comment on column public.api_keys.monthly_credit_limit is
  'P982: optional per-key monthly charged-credits cap (null → TOKFAI_MONTHLY_CREDIT_LIMIT).';
