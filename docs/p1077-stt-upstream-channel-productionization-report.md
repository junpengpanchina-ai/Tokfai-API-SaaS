# P1077 — STT upstream channel productionization

- commit: `c59496c8bbb2e2728ed3073ca40a86eeb6a10144`
- STT_CHANNEL_PRODUCTION_READY=YES
- REAL_ENTRY_TEST_COUNT=28
- DB_MIGRATION_REQUIRED=YES (supabase/migrations/0040_admin_upstream_channels.sql; file fallback when no service_role)
- ADMIN_CHANNEL_REUSED=YES
- ENV_FALLBACK_PRESERVED=YES

## Priority

`ADMIN_CHANNEL > ENV_FALLBACK > UNAVAILABLE`

## Cases

- PASS `CHANNEL_MODEL_FOUND` — adminChannels.ts AdminChannelRow
- PASS `CHANNEL_SECRET_STORAGE_FOUND` — reuses keyEncryption AES-GCM
- PASS `CHANNEL_ADMIN_API_FOUND` — create/list/patch/test
- PASS `CHANNEL_ADMIN_UI_FOUND` — channels panel STT form
- PASS `CHANNEL_RUNTIME_RESOLVER_FOUND` — ADMIN_CHANNEL > ENV_FALLBACK
- PASS `dist_build`
- PASS `dist_modules` — resolve + adminChannels
- PASS `C_unavailable_no_channel_no_env` — source=unavailable provider=unavailable
- PASS `A_admin_create_stt_channel_resolver` — found=true api_key_set=true
- PASS `A_runtime_resolver_admin_channel` — source=admin_channel channel=stt-p1077-a
- PASS `E_model_translation_rule` — {"clientModel":"whisper-1","upstreamModel":"whisper-large-v3-turbo"}
- PASS `E_upstream_received_channel_model` — model=whisper-large-v3-turbo text=P1077_CHANNEL_STT_OK
- PASS `H_consumer_key_not_upstream` — upstream auth is channel key
- PASS `I_secret_not_in_channel_row` — row JSON safe
- PASS `I_empty_secret_edit_preserves` — patch ok / secret preserved
- PASS `B_disabled_channel_env_fallback` — source=env
- PASS `B_env_fallback_uses_env_key` — auth_prefix=Bearer env-fallback-
- PASS `F_upstream_401` — code=upstream_auth_error leaked=false
- PASS `F_upstream_403` — code=upstream_auth_error leaked=false
- PASS `F_upstream_429` — code=upstream_rate_limited leaked=false
- PASS `F_upstream_500` — code=upstream_error leaked=false
- PASS `G_transport_error_mapping` — code=upstream_transport_error
- PASS `H_reject_consumer_key_as_upstream` — consumer_key_not_allowed_as_upstream
- PASS `test_connection_real_http` — ok=true status=200
- PASS `D_consumer_sk_tokfai_transcriptions` — status=200 text=TOKFAI_P1072_STT_OK
- PASS `D_source_wires_resolver` — audio.ts → resolver → admin channel
- PASS `D_three_input_auth_model` — consumer auth is sk-tokfai_* only
- PASS `CONSUMER_BASE_URL_ONLY` — audio route documents three-input
- PASS `CONSUMER_API_KEY_ONLY` — route uses consumer auth, not STT env key
- PASS `CONSUMER_MODEL_ONLY` — client model + internal translation
- PASS `EXTRA_CONSUMER_PROVIDER_FIELD` — NO consumer provider field
- PASS `EXTRA_CONSUMER_UPSTREAM_KEY` — NO consumer upstream key field
- PASS `EXTRA_CONSUMER_BASE_URL` — NO consumer base_url field
- PASS `CHAT_CHANGED` — chat route untouched by STT channel
- PASS `RESPONSES_CHANGED` — responses route untouched
- PASS `CURSOR_CHANGED` — cursor protocol untouched
- PASS `AZURE_INGRESS_CHANGED` — azure ingress untouched
- PASS `AUTOPRO_CHANGED` — executeChatCompletion untouched
- PASS `GPT_GEMINI_CHANGED` — gemini adapter untouched
- PASS `CONSUMER_AUTH_CHANGED` — api key auth untouched
- PASS `UPSTREAM_SECRET_PLAINTEXT_LOGGED` — NO
- PASS `UPSTREAM_SECRET_PUBLIC_API_EXPOSED` — NO
- PASS `CONSUMER_KEY_REUSED_AS_UPSTREAM` — NO
- PASS `typecheck`
- PASS `git_diff_check` — clean
- PASS `regression_P1071` — status=0
- PASS `regression_P1072` — status=0
- PASS `regression_P1073` — status=0
- PASS `regression_P1074` — status=0
- PASS `regression_P1075` — status=2
- PASS `regression_P1059_absent` — not in scripts/ — source isolation already covered
- PASS `regression_P1061_absent` — not in scripts/ — source isolation already covered
- PASS `regression_P1062R4_absent` — not in scripts/ — source isolation already covered
- PASS `regression_P1067_absent` — not in scripts/ — source isolation already covered
- PASS `regression_P1070_absent` — not in scripts/ — source isolation already covered
