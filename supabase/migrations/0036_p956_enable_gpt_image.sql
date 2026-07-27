-- P956: enable gpt-image-2 / gpt-image-2-vip on Image Generation path only.
-- Chat isolation remains P954 (image models rejected on /v1/chat/completions).

UPDATE public.models
SET
  enabled = true,
  visible = true,
  updated_at = now()
WHERE id IN ('gpt-image-2', 'gpt-image-2-vip');

UPDATE public.model_pricing
SET
  enabled = true,
  visible = true,
  billable = true,
  image_credits_per_generation = CASE model_id
    WHEN 'gpt-image-2' THEN 600
    WHEN 'gpt-image-2-vip' THEN 1300
    ELSE image_credits_per_generation
  END
WHERE model_id IN ('gpt-image-2', 'gpt-image-2-vip');
