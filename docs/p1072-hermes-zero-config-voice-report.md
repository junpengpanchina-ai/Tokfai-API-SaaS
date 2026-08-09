# P1072 — Hermes Zero-Config Voice + Real STT

## Result: **PASS**

```
STT_CAN_INHERIT_CHAT_BASE_URL=false
STT_CAN_INHERIT_CHAT_API_KEY=true
CLIENT_PATCH_REQUIRED=true

TOKFAI_REAL_STT_IMPLEMENTED=true
AUDIO_PROVIDER_ADAPTER_IMPLEMENTED=true
FAKE_TRANSCRIPTION_USED=NO

CORE_CHAT_THREE_INPUT_CONTRACT=true
VOICE_THREE_INPUT_CONTRACT=true

AUTOMATED_TEST_COUNT=29
REAL_ENTRY_TEST_COUNT=20
MANUAL_CONSUMER_STEPS=0
```

### CLIENT_LIMITATION

Stock Hermes Desktop (sourceMode=false) does not auto-inherit OPENAI_BASE_URL for STT; Desktop UI has no stt.openai.base_url field. Tokfai bootstrap writes STT_OPENAI_BASE_URL from Base URL so consumers never set a 4th field.

### Evidence

- STT base uses STT_OPENAI_BASE_URL/default api.openai.com; does not read OPENAI_BASE_URL
- Desktop UI voiceProviderKeys(stt,openai) only exposes stt.openai.model — no base_url persistence seam
- desktop-build-stamp sourceMode=false — bundled Desktop; Tokfai cannot inject inherit into binary

### Cases

| Case | OK | Real | Detail |
|---|---|---|---|
| phase1_stt_key_inherit | PASS | no | STT base uses STT_OPENAI_BASE_URL/default api.openai.com; does not read OPENAI_BASE_URL; Desktop UI voiceProviderKeys(stt,openai) only exposes stt.openai.model — no base_url persistence seam; desktop-build-stamp sourceMode=false — bundled Desktop; Tokfai cannot inject inherit into binary |
| phase1_stt_base_inherit_stock | PASS | no | stock Hermes must NOT silently claim base inherit |
| phase1_client_patch_required | PASS | no | Desktop bundled |
| source_audio_route | PASS | no | /Users/p/Documents/GitHub/Tokfai-API-SaaS/apps/dmit-api/src/routes/audio.ts |
| source_adapter | PASS | no | /Users/p/Documents/GitHub/Tokfai-API-SaaS/apps/dmit-api/src/upstream/audio/openaiCompatSttAdapter.ts |
| source_bootstrap | PASS | no | /Users/p/Documents/GitHub/Tokfai-API-SaaS/scripts/hermes-tokfai-voice-bootstrap.mjs |
| dist_build | PASS | yes | present |
| D_provider_adapter_invoked | PASS | yes | ADAPTER_STT_OK |
| E_transcription_text_returned_adapter | PASS | yes | ADAPTER_STT_OK |
| P_no_fake_in_adapter | PASS | yes | upstream-provided text |
| unavailable_adapter_no_fake_text | PASS | yes | throws not_available |
| bootstrap_three_input_writes_stt | PASS | no | status=0 |
| A_multipart_valid_audio | PASS | yes | status=200 text=TOKFAI_P1072_STT_OK |
| C_real_route_entry | PASS | yes | audio_transcription |
| E_transcription_text_returned | PASS | yes | TOKFAI_P1072_STT_OK |
| M_billing_not_chat_tokens | PASS | yes | not_billable |
| O_no_accidental_chat_execution | PASS | yes | audio |
| B_tokfai_auth | PASS | yes | status=200 |
| F_invalid_key_401 | PASS | yes | status=401 |
| G_malformed_multipart_400 | PASS | yes | status=400 |
| H_unsupported_format | PASS | yes | status=400 |
| I_oversized_audio_limit | PASS | no | 25MB gate in route |
| J_provider_http_400 | PASS | yes | status=400 code=invalid_request_error |
| K_provider_401_403 | PASS | yes | status=502 code=upstream_auth_error |
| L_provider_429 | PASS | yes | status=429 code=upstream_rate_limited |
| M_transport_timeout | PASS | yes | status=504 code=upstream_timeout |
| N_provider_unavailable | PASS | yes | status=503 code=all_upstreams_unavailable |
| Q_no_secret_audio_logging | PASS | no | structured meta only |
| chat_unaffected | PASS | yes | status=200 |

TOKFAI_P1072_HERMES_ZERO_CONFIG_VOICE_PASS
