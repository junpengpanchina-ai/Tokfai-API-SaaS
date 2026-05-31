-- =============================================================================
-- Tokfai P7.17 — seed missing catalog models + default pricing (idempotent)
--
-- Mirrors apps/dmit-api/src/catalog/seedModels.ts (frontend static catalog).
-- ON CONFLICT DO NOTHING — never overwrites existing rows or admin pricing edits.
-- Does NOT touch: credit_ledger, profiles, usage_logs, billing, webhooks
-- =============================================================================

insert into public.models (
  id,
  display_name,
  provider,
  model_type,
  enabled,
  visible,
  sort_order,
  owned_by
)
values
  ('gemini-3.1-pro', 'Gemini 3.1 Pro', 'tokfai', 'chat', true, true, 100, 'tokfai'),
  ('gemini-3-pro', 'Gemini 3 Pro', 'tokfai', 'chat', true, true, 110, 'tokfai'),
  ('gemini-3-flash', 'Gemini 3 Flash', 'tokfai', 'chat', true, true, 120, 'tokfai'),
  ('gemini-3.5-flash', 'Gemini 3.5 Flash', 'tokfai', 'chat', true, true, 130, 'tokfai'),
  ('gemini-2.5-flash', 'Gemini 2.5 Flash', 'tokfai', 'chat', true, true, 140, 'tokfai'),
  ('gemini-2.5-pro', 'Gemini 2.5 Pro', 'tokfai', 'chat', true, true, 150, 'tokfai'),
  ('gpt-5.4', 'GPT 5.4', 'tokfai', 'chat', true, true, 160, 'tokfai'),
  ('gpt-5.5', 'GPT 5.5', 'tokfai', 'chat', true, true, 170, 'tokfai'),
  ('gpt-image-2', 'GPT Image 2', 'tokfai', 'image', true, true, 200, 'tokfai'),
  ('gpt-image-2-vip', 'GPT Image 2 VIP', 'tokfai', 'image', false, true, 210, 'tokfai'),
  ('nano-banana-fast', 'Nano Banana Fast', 'tokfai', 'image', true, true, 220, 'tokfai'),
  ('nano-banana', 'Nano Banana', 'tokfai', 'image', true, true, 230, 'tokfai'),
  ('nano-banana-pro', 'Nano Banana Pro', 'tokfai', 'image', true, true, 240, 'tokfai'),
  ('nano-banana-2', 'Nano Banana 2', 'tokfai', 'image', true, true, 250, 'tokfai'),
  ('nano-banana-pro-vt', 'Nano Banana Pro VT', 'tokfai', 'image', true, true, 260, 'tokfai'),
  ('nano-banana-2-cl', 'Nano Banana 2 CL', 'tokfai', 'image', true, true, 270, 'tokfai'),
  ('nano-banana-2-4k-cl', 'Nano Banana 2 4K CL', 'tokfai', 'image', true, true, 280, 'tokfai'),
  ('nano-banana-pro-cl', 'Nano Banana Pro CL', 'tokfai', 'image', true, true, 290, 'tokfai'),
  ('nano-banana-pro-vip', 'Nano Banana Pro VIP', 'tokfai', 'image', true, true, 300, 'tokfai'),
  ('nano-banana-pro-4k-vip', 'Nano Banana Pro 4K VIP', 'tokfai', 'image', true, true, 310, 'tokfai'),
  ('veo', 'Veo', 'tokfai', 'video', false, true, 400, 'tokfai')
on conflict (id) do nothing;

insert into public.model_pricing (
  model_id,
  billing_type,
  input_credits_per_million_tokens,
  output_credits_per_million_tokens,
  image_credits_per_generation,
  markup_ratio,
  enabled,
  visible
)
values
  ('gemini-3.1-pro', 'chat', 225, 1050, 0, 1, true, true),
  ('gemini-3-pro', 'chat', 225, 1050, 0, 1, true, true),
  ('gemini-3-flash', 'chat', 60, 450, 0, 1, true, true),
  ('gemini-3.5-flash', 'chat', 120, 1000, 0, 1, true, true),
  ('gemini-2.5-flash', 'chat', 45, 300, 0, 1, true, true),
  ('gemini-2.5-pro', 'chat', 125, 625, 0, 1, true, true),
  ('gpt-5.4', 'chat', 105, 900, 0, 1, true, true),
  ('gpt-5.5', 'chat', 330, 2030, 0, 1, true, true),
  ('gpt-image-2', 'image', 0, 0, 600, 1, true, true),
  ('gpt-image-2-vip', 'image', 0, 0, 1300, 1, false, false),
  ('nano-banana-fast', 'image', 0, 0, 440, 1, true, true),
  ('nano-banana', 'image', 0, 0, 1400, 1, true, true),
  ('nano-banana-pro', 'image', 0, 0, 1800, 1, true, true),
  ('nano-banana-2', 'image', 0, 0, 1200, 1, true, true),
  ('nano-banana-pro-vt', 'image', 0, 0, 1800, 1, true, true),
  ('nano-banana-2-cl', 'image', 0, 0, 1600, 1, true, true),
  ('nano-banana-2-4k-cl', 'image', 0, 0, 3000, 1, true, true),
  ('nano-banana-pro-cl', 'image', 0, 0, 6000, 1, true, true),
  ('nano-banana-pro-vip', 'image', 0, 0, 10000, 1, true, true),
  ('nano-banana-pro-4k-vip', 'image', 0, 0, 16000, 1, true, true),
  ('veo', 'image', 0, 0, 0, 1, false, false)
on conflict (model_id) do nothing;
