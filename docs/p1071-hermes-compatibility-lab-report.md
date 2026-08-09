# P1071 — Hermes Compatibility Lab Report

> Goal: absorb Hermes OpenAI-compatible protocol differences inside Tokfai.
> Hermes owns agent orchestration; Tokfai owns protocol / auth / routing / stream / fallback / quota / billing / error mapping.

## Result: **PASS**

Marker: `TOKFAI_P1071_HERMES_COMPATIBILITY_LAB_PASS`

Git: `0d0ebb6535c1f4702d3bfcda73676cbe55a629ed`
Mode: offline mock
Base: `http://127.0.0.1:8787`

---

## Final report fields

```
HERMES_CHAT_CONTRACT_FOUND=true
HERMES_RESPONSES_CONTRACT_FOUND=true
HERMES_STREAM_CONTRACT_FOUND=true
HERMES_TOOL_CONTRACT_FOUND=true
HERMES_AUDIO_CONTRACT_FOUND=true

HERMES_STT_BASE_URL_CONFIGURABLE=true
HERMES_STT_PATH=/v1/audio/transcriptions
TOKFAI_AUDIO_INGRESS_REQUIRED=true

AUTOMATED_CASE_COUNT=31
REAL_ENTRY_CASE_COUNT=27
MANUAL_USER_STEPS_REQUIRED=0

CONSUMER_THREE_INPUT_CONTRACT_PRESERVED=true
HERMES_MANUAL_USER_STEPS_REQUIRED_FOR_REGRESSION=0
```

---

## Capability matrix (from local Hermes)

| Capability | Touches Tokfai | Notes |
|---|---|---|
| CHAT | true | /v1/chat/completions |
| RESPONSES | true | /v1/responses |
| STREAMING | true | /v1/responses?stream=true |
| TOOLS | true |  |
| TOOL_RESULTS | true |  |
| IMAGES | partial | image_generate is Hermes-local tool; may call provider separately |
| VISION | true | responses input_image,Hermes vision_analyze tool / auxiliary.vision |
| AUDIO_STT | optional | /v1/audio/transcriptions |
| TTS | optional | tts.openai.base_url configurable; separate from chat |
| WEB_FETCH | false | Hermes-owned tools (web_search/web_extract); may use auxiliary models |
| CONTEXT_COMPRESSION | optional | auxiliary.compression.base_url can point at Tokfai |

---

## Consumer three-input contract

For **Chat / Responses / Tools / Streaming**, Hermes consumers only need:

1. Base URL (`https://api.tokfai.com/v1`)
2. API Key (`sk-tokfai_...`)
3. Model (e.g. `gpt-5.5`)

**CLIENT_LIMITATION — STT / TTS:** Hermes STT defaults to `https://api.openai.com/v1` and does **not** inherit the chat Base URL (Desktop `sourceMode=false`). Terminal bootstrap is internal-only. Product path: Tokfai Hermes Connector (`scripts/hermes-tokfai-connector.mjs`, P1073). See P1072 for real `/v1/audio/transcriptions`.

---

## Failure UX

Harness asserts consumer-visible errors stay in stable vocabulary (busy / connection failed / invalid key / quota / rate limit / invalid request / not available) and never leak `UND_ERR_*`, Node stacks, or provider secrets.

---

## Cases

| Case | OK | Real entry | Detail |
|---|---|---|---|
| inventory_contract_meta | PASS | no | tools=44 path=/v1/responses |
| inventory_capability_matrix | PASS | no | keys=CHAT,RESPONSES,STREAMING,TOOLS,TOOL_RESULTS,IMAGES,VISION,AUDIO_STT,TTS,WEB_FETCH,CONTEXT_COMPRESSION |
| dist_build | PASS | yes | responsesTransform+responsesSse |
| transform_44_tools_to_chat | PASS | yes | chatTools=44 |
| transform_tool_result_resume | PASS | yes | msgs=3 |
| transform_provider_tool_call_unchanged | PASS | yes | {"type":"function_call","id":"fc_call_unchanged_abc","call_id":"call_unchanged_abc","name":"read_file","arguments":"{\"path\":\"README.md\"}","status":"completed"} |
| transform_sse_function_call_framing | PASS | yes | events=5 |
| audio_ingress_source_present | PASS | no | /Users/p/Documents/GitHub/Tokfai-API-SaaS/apps/dmit-api/dist/routes/audio.js |
| A_responses_text_nonstream | PASS | yes | status=200 object=response |
| B_responses_stream | PASS | yes | status=200 events=9 |
| C_44_tool_request | PASS | yes | status=200 tools=44 fc=read_file |
| D_provider_tool_call_unchanged | PASS | yes | name=read_file call_id=call_mock_hermes_p1071 |
| E_tool_result_resume | PASS | yes | status=200 text= |
| F_client_cancel | PASS | yes | aborted |
| G_provider_http_400 | PASS | yes | status=400 code=invalid_request_error |
| H_provider_http_401 | PASS | yes | status=502 code=upstream_auth_error |
| I_provider_http_429 | PASS | yes | status=429 code=upstream_rate_limited |
| J_transport_timeout | PASS | yes | status=504 |
| K_fallback | PASS | yes | fallback_attempts=1 strategy=alias:gpt-5.5 |
| L_quota | PASS | yes | status=429 |
| M_billing | PASS | yes | billing=charged credits=0.000001 |
| N_malformed_request | PASS | yes | status=400 |
| O_image_vision_request | PASS | yes | status=200 |
| O_vision_analyze_entry | PASS | yes | status=200 |
| P_audio_transcription_request | PASS | yes | status=200 text=yes code=n/a |
| Q_audio_auth_base_url_behavior | PASS | yes | status=401 |
| Q_stt_base_url_configurable_inventory | PASS | no | CLIENT_LIMITATION: STT does not inherit chat Base URL |
| R_request_body_size_diagnostics | PASS | yes | status=200 bytes=120095 code=n/a |
| S_provider_outage | PASS | yes | status=503 |
| failure_ux_connection_failed | PASS | yes | Provider connection failed. |
| chat_completions_still_works | PASS | yes | status=200 |

---

## Artifacts

- Fixtures: `scripts/fixtures/hermes-p1071/`
- Harness: `scripts/p1071-hermes-compatibility-lab.mjs`
- Summary: `tmp/p1071-hermes-compatibility-lab-summary.json`
- Audio seam: `apps/dmit-api/src/routes/audio.ts`
- Responses Hermes absorb: `apps/dmit-api/src/lib/responsesTransform.ts`

---

TOKFAI_P1071_HERMES_COMPATIBILITY_LAB_PASS
