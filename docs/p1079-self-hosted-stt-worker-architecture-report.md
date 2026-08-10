# P1079 — Self-hosted STT worker architecture

- git_head=c59496c8bbb2e2728ed3073ca40a86eeb6a10144
- script=scripts/p1079-self-hosted-stt-worker-architecture.mjs
- all_ok=true

## Report markers
- SELF_HOSTED_STT_PROVIDER_IMPLEMENTED=YES
- CONSUMER_EXTRA_CONFIG_REQUIRED=NO
- HKG_INFERENCE_REQUIRED=NO
- AUDIO_TRANSCODING_ON_GATEWAY=NO
- MULTIPART_PASSTHROUGH=YES
- WORKER_SECRET_ENCRYPTED=YES
- WORKER_SECRET_EXPOSED=NO
- ADMIN_CHANNEL_REUSED=YES
- CHAT_CHANGED=NO
- RESPONSES_CHANGED=NO
- CURSOR_CHANGED=NO
- AZURE_CHANGED=NO
- AUTOPRO_CHANGED=NO
- GPT_GEMINI_CHANGED=NO
- BILLING_DOUBLE_CHARGE_RISK=NO
- TYPECHECK=PASS
- BUILD=PASS
- REGRESSIONS=PASS
- GIT_DIFF_CHECK=PASS
- UNRELATED_DIFF_FOUND=NO

## Cases
- PASS PROVIDER_TYPE_DECLARED — provider type wired
- PASS WORKER_CONTRACT_PATH — POST {base}/v1/audio/transcriptions
- PASS NO_BASE64_JSON_TRANSPORT — adapter never base64-JSON encodes audio
- PASS NO_FFMPEG_ON_GATEWAY — no transcoding
- PASS GROQ_COMPAT_PRESERVED — groq path still present
- PASS ADMIN_UI_PROVIDER — admin dropdown + worker fields
- PASS SECRET_REDACTION_SOURCE — list masks secrets
- PASS BILLING_SEAM_MARKED — single debit path + future cost seam
- PASS typecheck
- PASS build
- PASS dist_modules — adapter + resolve + adminChannels
- PASS A_multipart_file_passthrough — path=/v1/audio/transcriptions multipart=true base64json=false
- PASS B_model_passthrough_default — upstream=tiny.en hit=tiny.en
- PASS C_language_passthrough — language=zh
- PASS D_successful_transcript — P1079_MOCK_TRANSCRIPT_OK
- PASS E_worker_401 — code=worker_auth_error
- PASS E_worker_403 — code=worker_auth_error
- PASS F_worker_overloaded — code=worker_overloaded
- PASS G_worker_5xx — code=worker_unreachable
- PASS H_worker_timeout — code=worker_timeout
- PASS I_network_failure — code=worker_unreachable leaked=false
- PASS J_malformed_json — code=worker_invalid_response
- PASS K_empty_transcript — code=worker_invalid_response
- PASS L_secret_redaction — listSafe=true testSafe=true errSafe=true
- PASS LARGE_FILE_NO_BASE64_JSON — bodyBytes=2097417 file=2097152 overhead=265 buffering=gateway_parse_once+formdata_serialize
- PASS PRIORITY_NOT_HARDCODED_SELF_FIRST — picked=stt-p1079-prio-groq provider=groq_whisper_compatible
- PASS OPTIONAL_WORKER_SECRET — provider=self_hosted_whisper
- PASS CHAT_UNCHANGED — chat route untouched
- PASS RESPONSES_UNCHANGED — responses untouched
- PASS CURSOR_UNCHANGED — cursor untouched
- PASS AZURE_UNCHANGED — azure untouched
- PASS AUTOPRO_UNCHANGED — executeChatCompletion untouched
- PASS GPT_GEMINI_UNCHANGED — gemini adapter untouched
- PASS CONSUMER_THREE_INPUT — consumer still Base URL + key + model
- PASS git_diff_check — clean
- PASS REGRESSION_P1059 — status=0 tail=(node:20387) ExperimentalWarning: Module mocking is an experimental feature and might change at any time | (Use `node --trace-warnings ...` to show where the warning was created)
- PASS REGRESSION_P1061 — status=0 tail=(node:20438) ExperimentalWarning: Module mocking is an experimental feature and might change at any time | (Use `node --trace-warnings ...` to show where the warning was created)
- PASS REGRESSION_P1062R4 — status=0 tail={"ts":"2026-08-10T01:09:04.338Z","level":"warn","msg":"upstream_provider_timeout","requestId":"p1062-c3","route":"/v1/chat/completions","model":"gpt-5.5","resolvedModel":"gpt-5.5",
- PASS REGRESSION_P1067 — status=0 tail={"ts":"2026-08-10T01:09:27.364Z","level":"warn","msg":"upstream_provider_transport_failed","requestId":"req_4Gpw_E2vmUFH6RI5","route":"/v1/chat/completions","model":"gpt-5.5","requ
- PASS REGRESSION_P1070 — status=0 tail={"ts":"2026-08-10T01:09:28.843Z","level":"warn","msg":"chat_completion_failed","requestId":"req_P7LbgUaoohMSw8Hu","requestedModel":"gpt-5.5","resolvedModel":null,"attemptedModel":"
- PASS REGRESSION_P1071 — status=0 tail=summary: /Users/p/Documents/GitHub/Tokfai-API-SaaS/tmp/p1071-hermes-compatibility-lab-summary.json | TOKFAI_P1071_HERMES_COMPATIBILITY_LAB_PASS
- PASS REGRESSION_P1072 — status=0 tail=report: /Users/p/Documents/GitHub/Tokfai-API-SaaS/docs/p1072-hermes-zero-config-voice-report.md | TOKFAI_P1072_HERMES_ZERO_CONFIG_VOICE_PASS
- PASS REGRESSION_P1074 — status=0 tail=report: /Users/p/Documents/GitHub/Tokfai-API-SaaS/docs/p1074-hermes-production-stt-activation-report.md | TOKFAI_P1074_HERMES_PRODUCTION_STT_ACTIVATION_DONE
- PASS REGRESSION_P1077 — status=0 tail={"ts":"2026-08-10T01:09:34.879Z","level":"warn","msg":"admin_channel_audit_skipped","action":"channels.create","resourceId":"new"} | {"ts":"2026-08-10T01:09:34.882Z","level":"warn"
- PASS REGRESSION_P1077R2 — status=0 tail={"ts":"2026-08-10T01:09:53.446Z","level":"warn","msg":"admin_channel_audit_skipped","action":"channels.test","resourceId":"stt-p1077r2-persist"} | {"ts":"2026-08-10T01:09:53.447Z",
- PASS REGRESSION_P1077R3 — status=0 tail={"ts":"2026-08-10T01:10:25.660Z","level":"warn","msg":"admin_channel_audit_skipped","action":"channels.patch","resourceId":"stt-p1077r3-gate"} | {"ts":"2026-08-10T01:10:25.661Z","l
- PASS UNRELATED_DIFF_FOUND — none

## Multipart buffering note
- Gateway: Hono parseBody buffers audio once for validation (size/ext).
- Adapter: FormData + Blob over the same Uint8Array (no base64 JSON).
- Worker receives multipart/form-data at POST {workerBaseUrl}/v1/audio/transcriptions.

TOKFAI_P1079_SELF_HOSTED_STT_WORKER_ARCHITECTURE_PASS
