# P1075 — Hermes LIVE STT Firetest

## Result: **BLOCKED**

```
REAL_STT_CREDENTIAL_FOUND=false
REAL_STT_PROVIDER_NETWORK_TESTED=true
REAL_STT_PROVIDER_NETWORK_OK=true

REAL_EXTERNAL_PROVIDER_CALL_EXECUTED=false
REAL_EXTERNAL_PROVIDER_HTTP_STATUS=null
REAL_EXTERNAL_TRANSCRIPTION_RECEIVED=false

REAL_HTTP_ENTRY_EXECUTED=false
REAL_PROVIDER_EXECUTED=false
TRANSCRIPTION_RETURNED=false

LIVE_FIX_COUNT=0

HERMES_REAL_VOICE_REQUEST_CREATED=false
TOKFAI_AUDIO_ROUTE_REACHED=false
HERMES_TRANSCRIPT_DISPLAYED=false

PRODUCTION_STT_UPSTREAM_READY=false
HERMES_VOICE_READY=false

EXTERNAL_BLOCKER=No legitimate TOKFAI_STT_BASE_URL + TOKFAI_STT_API_KEY in Tokfai local/production config (apps/dmit-api/.env missing; process env unset). Consumer sk-tokfai_* keys are not STT upstream credentials. GRSAI is not assumed as STT. Production api.tokfai.com returns route_not_found for POST /v1/audio/transcriptions (STT not deployed). api.openai.com TCP/TLS not reachable from this network (DNS resolves to non-OpenAI anycast). api.groq.com is reachable but no Groq STT key is configured in Tokfai. 
```

### Attempts

- LIVE_ATTEMPT_1: discover Tokfai STT creds + network + prod HTTP
- LIVE_ATTEMPT_1_PROD: api.tokfai.com/v1/audio/transcriptions status=404 bytes=207 hasText=false
- LIVE_FIX_1: none — EXTERNAL_BLOCKER is credential/deploy/network, not code

### Cases

| Case | OK | Detail |
|---|---|---|
| wav_fixture | PASS | /Users/p/Documents/GitHub/Tokfai-API-SaaS/scripts/fixtures/p1074/stt-canary-silence.wav |
| not_auto_grsai_as_stt | PASS | GRSAI not assumed |
| real_stt_credential_in_tokfai_config | FAIL | missing TOKFAI_STT_BASE_URL/API_KEY in Tokfai .env |
| prod_audio_route_deployed | FAIL | status=404 |
| production_stt_upstream_ready_honest | PASS | must stay NO without real transcription |
| hermes_voice_ready_honest | PASS | must stay NO |
| external_blocker_stated | PASS | No legitimate TOKFAI_STT_BASE_URL + TOKFAI_STT_API_KEY in Tokfai local/production config (apps/dmit-api/.env missing; process env unset). Consumer sk-tokfai_* keys are not STT upstream credentials. GR |

### Ops unblock (not done by this task — no deploy / no secret invent)

1. Add server-side to `apps/dmit-api/.env` (production host):
   `TOKFAI_STT_PROVIDER=openai_compatible` (or `groq_whisper_compatible`)
   `TOKFAI_STT_BASE_URL=...`
   `TOKFAI_STT_API_KEY=...`
   `TOKFAI_STT_DEFAULT_MODEL=whisper-1` (or Groq whisper model)
2. Deploy/reload dmit-api so `POST /v1/audio/transcriptions` exists on api.tokfai.com
3. Ensure this network can reach the chosen STT host (OpenAI currently DNS/TCP-blocked here; Groq TLS works)
4. Re-run: `node scripts/p1075-hermes-live-stt-firetest.mjs`

TOKFAI_P1075_HERMES_LIVE_STT_BLOCKED
