# P1073 — Hermes Voice Productization

## Result: **DONE**

```
HERMES_CORE_READY=true
HERMES_AUDIO_PROTOCOL_READY=true
HERMES_CONNECTOR_READY=true
HERMES_VOICE_READY=false

SAFE_AUTOMATION_SEAM_FOUND=false
CLIENT_AUTOMATION_IMPOSSIBLE_WITH_UNMODIFIED_HERMES=true
CONNECTOR_REQUIRED=true

FRESH_USER_ONLY_THREE_DATA_FIELDS=true
TERMINAL_COMMAND_REQUIRED=false
MANUAL_CONFIG_EDIT_REQUIRED=false
EXTRA_ENDPOINT_FIELD_REQUIRED=false
EXTRA_SECRET_REQUIRED=false

THREE_INPUT_CONTRACT=true
ZERO_ACTION_SETUP=false
CONNECT_ACTION_REQUIRED=true

TOKFAI_REAL_STT_IMPLEMENTED=true
PRODUCTION_STT_UPSTREAM_READY=false

ZERO_CONFIG_CLAIM_VALID=false
VOICE_THREE_INPUT_CONTRACT=true
```

> P1074: `HERMES_VOICE_READY=YES` only when `PRODUCTION_STT_UPSTREAM_READY=YES`
> and a real external transcription canary has succeeded. Protocol/connector alone ≠ voice ready.

### Phase 1 — Seam

- HERMES_PROVIDER_SAVE_PATH: `/Users/p/.hermes/.env + /Users/p/.hermes/config.yaml (via Desktop → gateway PUT /api/env + /api/model/set)`
- HERMES_AGENT_CONFIG_GENERATOR: `hermes-agent web/gateway handlers for /api/env and model assignment; Electron Application Support/Hermes holds UI prefs only`
- HERMES_DESKTOP_CONFIG_BRIDGE: `apps/desktop hermes.ts setEnvVar/setModelAssignment/saveHermesConfig → local gateway → ~/.hermes`
- Stock Hermes has **no** provider-save hook that copies chat Base URL → STT.

### Product path

1. Install / open **Tokfai Hermes Connector** once (`scripts/hermes-tokfai-connector.mjs install|gui`).
2. Enter only Base URL + API Key + Model (in Connector GUI **or** Hermes UI).
3. Connector watch/sync writes `STT_OPENAI_BASE_URL` from Tokfai chat base; STT auth inherits `OPENAI_API_KEY`.

### STT upstream

- AVAILABLE_STT_PROVIDERS=openai_compatible,groq_whisper_compatible,unavailable
- CONFIGURED_STT_PROVIDER=unavailable
- STT_PROVIDER_CREDENTIAL_PRESENT=false
- STT_PROVIDER_NETWORK_REACHABLE=false
- STT_PROVIDER_MODEL=whisper-1

### Cases

| Case | OK | Detail |
|---|---|---|
| connector_source | PASS | /Users/p/Documents/GitHub/Tokfai-API-SaaS/scripts/hermes-tokfai-connector.mjs |
| sync_lib | PASS | lib |
| phase1_seam_facts | PASS | {"HERMES_PROVIDER_SAVE_PATH":"/Users/p/.hermes/.env + /Users/p/.hermes/config.yaml (via Desktop → gateway PUT /api/env + /api/model/set)","SAFE_AUTOMATION_SEAM_FOUND":false} |
| stt_adapter_exists | PASS | openai_compatible,groq_whisper_compatible,unavailable |
| production_stt_honest | PASS | ready=false |
| fresh_no_stt_prewrite | PASS | no STT prewrite |
| fresh_connector_sync | PASS | applied |
| fresh_stt_target_tokfai | PASS | https://api.tokfai.com/v1/audio/transcriptions |
| fresh_no_voice_tools_key | PASS | STT key inherits OPENAI_API_KEY |
| fresh_preserve_chat | PASS | chat untouched |
| fresh_yaml_stt_base | PASS | stt.openai.base_url |
| preserve_explicit_stt | PASS | https://api.openai.com/v1 |
| preserve_groq_stt | PASS | preserve_non_openai_stt_provider:groq |
| connector_connect_three_fields | PASS | status=0 |
| audio_no_chat_pipeline | PASS | isolated |
| claims_p1072_smoke_updated | PASS | p1072 smoke honesty |
| claims_no_false_prod_stt_ready | PASS | docs |

TOKFAI_P1073_HERMES_VOICE_PRODUCTIZATION_DONE
