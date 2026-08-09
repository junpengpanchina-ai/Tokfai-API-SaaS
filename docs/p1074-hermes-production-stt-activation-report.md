# P1074 — Hermes Production STT Activation

## Result: **DONE**

```
HERMES_CORE_READY=true
HERMES_AUDIO_PROTOCOL_READY=true
HERMES_CONNECTOR_READY=true
HERMES_VOICE_READY=false

THREE_INPUT_CONTRACT=true
ZERO_ACTION_SETUP=false

AVAILABLE_STT_PROVIDERS=openai_compatible,groq_whisper_compatible,unavailable
SELECTED_STT_PROVIDER=openai_compatible
PRODUCTION_STT_CREDENTIAL_PRESENT=false
PRODUCTION_STT_UPSTREAM_READY=false

MOCK_STT_TEST_PASS=true
REAL_EXTERNAL_STT_CANARY_EXECUTED=false
REAL_EXTERNAL_STT_CANARY_PASS=N/A

CONSUMER_DATA_FIELD_COUNT=3
CONNECT_ACTION_REQUIRED=true
TERMINAL_REQUIRED=false
CONFIG_EDIT_REQUIRED=false
```

### Provider matrix

| PROVIDER | ENDPOINT | KEY | MODEL | IMPLEMENTED | CONFIGURED |
|---|---|---|---|---|---|
| openai_compatible | TOKFAI_STT_BASE_URL | TOKFAI_STT_API_KEY | TOKFAI_STT_DEFAULT_MODEL | true | false |
| groq_whisper_compatible | TOKFAI_STT_BASE_URL | TOKFAI_STT_API_KEY | TOKFAI_STT_DEFAULT_MODEL | true | false |
| unavailable | TOKFAI_STT_BASE_URL | TOKFAI_STT_API_KEY | TOKFAI_STT_DEFAULT_MODEL | true | true |

### Activation (ops)

Set on **dmit-api** only (never in Hermes / never consumer-facing):

```
TOKFAI_STT_PROVIDER=openai_compatible
TOKFAI_STT_BASE_URL=https://api.openai.com/v1
TOKFAI_STT_API_KEY=<server secret>
TOKFAI_STT_DEFAULT_MODEL=whisper-1
# optional: TOKFAI_STT_PRICE_CREDITS=<credits per success>
```

Then re-run with `LIVE=1` so the HTTP canary hits real upstream through Tokfai.

### Cases

| Case | OK | Detail |
|---|---|---|
| wav_fixture | PASS | /Users/p/Documents/GitHub/Tokfai-API-SaaS/scripts/fixtures/p1074/stt-canary-silence.wav |
| no_grsai_assumed_as_stt | PASS | GRSAI is chat/image; STT uses TOKFAI_STT_* only |
| env_contract_documented | PASS | .env.example |
| stt_optional_boot | PASS | unavailable + gateway RPM when unpriced |
| billing_not_chat_tokens | PASS | audio billing seam |
| connector_three_fields | PASS | connector |
| mock_http_stt_entry | PASS | status=200 text=TOKFAI_P1072_STT_OK |
| real_external_skipped_no_live_or_creds | PASS | EXECUTED=NO PASS=N/A |
| chat_unaffected_by_stt | PASS | status=200 |

TOKFAI_P1074_HERMES_PRODUCTION_STT_ACTIVATION_DONE
