-- Hide upstream-unregistered / admin test models from public catalog.
UPDATE public.models
SET enabled = false, visible = false, updated_at = now()
WHERE id IN ('gpt-4o-mini', 'test-admin-model-001');

UPDATE public.model_pricing
SET enabled = false, visible = false, updated_at = now()
WHERE model_id IN ('gpt-4o-mini', 'test-admin-model-001');
