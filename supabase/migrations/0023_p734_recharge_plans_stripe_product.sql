-- =============================================================================
-- Tokfai P7.34 — recharge_plans Stripe product id (admin auto-provisioning)
--
-- Admin create/update provisions Stripe Product + one-time Price server-side.
-- Does NOT change checkout / webhook / credit_ledger semantics.
-- =============================================================================

alter table public.recharge_plans
  add column if not exists stripe_product_id text;

comment on column public.recharge_plans.stripe_product_id is
  'Stripe Product id (prod_...) provisioned automatically by DMIT admin plan APIs.';
