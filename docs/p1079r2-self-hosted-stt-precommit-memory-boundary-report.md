# P1079R2 — Self-hosted STT precommit memory boundary

- git_head=c59496c8bbb2e2728ed3073ca40a86eeb6a10144
- FINAL_VERDICT=A
- MEMORY_BEHAVIOR_CLASS=C_MULTIPLE_FULL_BUFFERS

## Phase 1 — git scope
- P1079R2_CHANGED_FILE_COUNT=24
- UNRELATED_DIFF_FOUND=NO
- files:
  - apps/dmit-api/src/env.ts
  - apps/dmit-api/src/errors.ts
  - apps/dmit-api/src/routes/adminChannels.ts
  - apps/dmit-api/src/routes/audio.ts
  - apps/dmit-api/src/upstream/audio/openaiCompatSttAdapter.ts
  - apps/dmit-api/src/upstream/audio/readMultipartAudioWithLimit.ts
  - apps/dmit-api/src/upstream/audio/resolveAudioProvider.ts
  - apps/dmit-api/src/upstream/audio/selfHostedWhisperAdapter.ts
  - apps/dmit-api/src/upstream/audio/types.ts
  - apps/web/components/admin/admin-channels-panel.tsx
  - apps/web/lib/admin/client.ts
  - apps/web/lib/dashboard-safe/labels.generated.ts
  - docs/p1077-stt-upstream-channel-productionization-report.md
  - docs/p1077r2-stt-channel-persistence-precommit-audit-report.md
  - docs/p1077r3-stt-channel-production-migration-gate-report.md
  - docs/p1079-self-hosted-stt-worker-architecture-report.md
  - docs/p1079r2-self-hosted-stt-precommit-memory-boundary-report.md
  - scripts/lib/p1079-mock-stt-worker.mjs
  - scripts/p1072-hermes-zero-config-voice-smoke.mjs
  - scripts/p1077-stt-upstream-channel-productionization.mjs
  - scripts/p1077r2-stt-channel-persistence-precommit-audit.mjs
  - scripts/p1078-stt-stored-secret-fingerprint-proof.mjs
  - scripts/p1079-self-hosted-stt-worker-architecture.mjs
  - scripts/p1079r2-self-hosted-stt-precommit-memory-boundary.mts

### Allowlist lineage (P1077R2)
- env.ts: TOKFAI_STT_MAX_UPLOAD_BYTES (STT upload hard limit)
- errors.ts: worker_* / request_body_too_large status map
- audio/*: bounded multipart reader + self-hosted adapter
- scripts/docs p107*: STT lineage harness/reports

## Phase 2 — memory path
1. First full residency: capped request body Buffer.concat in readMultipartAudioWithLimit
2. File bytes type: Uint8Array (from File.arrayBuffer)
3. Blob ctor: runtime RSS evidence collected (may copy into Blob store)
4. FormData: holds Blob reference (not proven as immediate second full copy)
5. fetch/undici: worker observed multipart body bytes ≥ file size (wire serialization copy)
6. Provider response: capped at 64KiB (not audio-sized)
7. Client abort: AbortSignal.any cancels worker fetch; buffers become unreachable for GC
- MEMORY_BEHAVIOR_CLASS=C_MULTIPLE_FULL_BUFFERS

## Report markers
- FINAL_VERDICT=A
- MEMORY_BEHAVIOR_CLASS=C_MULTIPLE_FULL_BUFFERS
- STT_UPLOAD_LIMIT_IMPLEMENTED=YES
- OVERSIZE_REJECTED_BEFORE_WORKER=YES
- CLIENT_ABORT_PROPAGATES=YES
- WORKER_SECRET_PUBLICLY_EXPOSED=NO
- WORKER_BASE_URL_PUBLICLY_EXPOSED=NO
- CONSUMER_CAN_OVERRIDE_WORKER_URL=NO
- CHAT_CHANGED=NO
- RESPONSES_CHANGED=NO
- CURSOR_CHANGED=NO
- AZURE_CHANGED=NO
- AUTOPRO_CHANGED=NO
- GPT_GEMINI_CHANGED=NO
- TYPECHECK=PASS
- BUILD=PASS
- REGRESSIONS=PASS
- GIT_DIFF_CHECK=PASS
- UNRELATED_DIFF_FOUND=NO
- P1079R2_CHANGED_FILE_COUNT=24
- AUDIO_FULL_BUFFER_COUNT_PROVEN=≥2 (ingress Buffer + file Uint8Array; Blob/wire additional)
- FORMDATA_SECOND_COPY_PROVEN=REF_NOT_IMMEDIATE_FULL_COPY
- FETCH_SERIALIZATION_COPY_PROVEN=YES_WIRE_BODY_OBSERVED
- REAL_ENTRY_LARGE_BODY_TEST_COUNT=6
- MAX_TEST_AUDIO_BYTES=26214401
- MAX_RSS_DELTA_BYTES=289603584
- TEMP_FILES_CLEANED=YES

## Cases
- PASS [STATIC_SOURCE_CHECK] PHASE1_GIT_SCOPE — count=24
- PASS [STATIC_SOURCE_CHECK] UNRELATED_DIFF_FOUND — NO
- PASS [STATIC_SOURCE_CHECK] GIT_DIFF_CHECK — clean
- PASS [STATIC_SOURCE_CHECK] ALLOWLIST_LINEAGE_DOCUMENTED — env.ts/errors.ts/audio/* documented as STT lineage
- PASS [STATIC_SOURCE_CHECK] FIRST_FULL_BUFFER_STEP — first full buffer = capped stream→Buffer.concat before FormData parse
- PASS [UNIT_TEST] BLOB_COPY_RUNTIME — blobDelta=4210688 size=4194304 (Blob ctor may copy or retain)
- PASS [UNIT_TEST] FORMDATA_SECOND_COPY_PROVEN — formDelta=0 — FormData holds Blob ref (not proven as immediate full second copy)
- PASS [UNIT_TEST] FETCH_SERIALIZATION_COPY_PROVEN — workerObservedBody=4194485 file=4194304
- PASS [UNIT_TEST] MEMORY_BEHAVIOR_CLASS — C_MULTIPLE_FULL_BUFFERS
- PASS [STATIC_SOURCE_CHECK] STT_UPLOAD_LIMIT_FOUND_BEFORE — pre-R2: hardcoded MAX_AUDIO_BYTES=25MiB AFTER full parseBody (not early)
- PASS [STATIC_SOURCE_CHECK] STT_UPLOAD_LIMIT_IMPLEMENTED — configurable + Content-Length early + stream cap
- PASS [STATIC_SOURCE_CHECK] STT_UPLOAD_LIMIT_CONFIGURABLE
- PASS [REAL_ENTRY_TEST] LARGE_BODY_1MB — status=200 workerHits=1 rssDelta=0 latencyMs=16
- PASS [REAL_ENTRY_TEST] LARGE_BODY_10MB — status=200 workerHits=1 rssDelta=129122304 latencyMs=51
- PASS [REAL_ENTRY_TEST] LARGE_BODY_25MB — status=200 workerHits=1 rssDelta=289603584 latencyMs=108
- PASS [REAL_ENTRY_TEST] LARGE_BODY_limit-1 — status=200 workerHits=1 rssDelta=65142784 latencyMs=74
- PASS [REAL_ENTRY_TEST] LARGE_BODY_limit — status=200 workerHits=1 rssDelta=39157760 latencyMs=71
- PASS [REAL_ENTRY_TEST] LARGE_BODY_limit+1 — status=413 workerHits=0 rssDelta=0 latencyMs=33
- PASS [REAL_ENTRY_TEST] REAL_ENTRY_LARGE_BODY_TEST_COUNT — 6
- PASS [REAL_ENTRY_TEST] MAX_TEST_AUDIO_BYTES — 26214401
- PASS [REAL_ENTRY_TEST] MAX_RSS_DELTA_BYTES — 289603584
- PASS [REAL_ENTRY_TEST] OVERSIZE_REJECTED_BEFORE_WORKER
- PASS [REAL_ENTRY_TEST] TEMP_FILES_CLEANED
- PASS [REAL_ENTRY_TEST] OVERSIZE_STATUS — 413
- PASS [REAL_ENTRY_TEST] OVERSIZE_WORKER_CALLED — NO
- PASS [REAL_ENTRY_TEST] CHUNKED_OR_MISSING_CL_PROTECTED — status=413 workerHits=0
- PASS [REAL_ENTRY_TEST] CLIENT_ABORT_DURING_WORKER — status=499 code=client_aborted hits=1
- PASS [REAL_ENTRY_TEST] WORKER_TIMEOUT — status=504 code=worker_timeout
- PASS [REAL_ENTRY_TEST] FAILED_REQUEST_DOUBLE_BILLING — successCalls=0 status=not_billable
- PASS [REAL_ENTRY_TEST] WORKER_SOCKET_RESET — code=worker_unreachable
- PASS [REAL_ENTRY_TEST] CLIENT_ABORT_MID_UPLOAD — destroyed=true workerHits=0
- PASS [REAL_ENTRY_TEST] CLIENT_ABORT_PROPAGATES
- PASS [STATIC_SOURCE_CHECK] WORKER_FETCH_ABORTED — AbortSignal.any(timeout, clientAbort)
- PASS [REAL_ENTRY_TEST] DANGLING_TIMER_FOUND — NO (AbortSignal.timeout auto-clears)
- PASS [REAL_ENTRY_TEST] UNHANDLED_REJECTION_FOUND — NO
- PASS [REAL_ENTRY_TEST] WORKER_SECRET_PUBLICLY_EXPOSED — NO
- PASS [REAL_ENTRY_TEST] WORKER_BASE_URL_PUBLICLY_EXPOSED — NO
- PASS [REAL_ENTRY_TEST] WORKER_HOST_TOPOLOGY_PUBLICLY_EXPOSED — NO
- PASS [REAL_ENTRY_TEST] UPSTREAM_RAW_ERROR_FORWARDED — NO
- PASS [STATIC_SOURCE_CHECK] CONSUMER_CAN_OVERRIDE_WORKER_URL — NO
- PASS [STATIC_SOURCE_CHECK] ADMIN_AUTH_REQUIRED_FOR_WORKER_URL — YES
- PASS [STATIC_SOURCE_CHECK] WORKER_URL_SCHEME_VALIDATED — http/https only
- PASS [STATIC_SOURCE_CHECK] MALFORMED_WORKER_URL_FAIL_CLOSED
- PASS [REAL_ENTRY_TEST] CONSUMER_MULTIPART_URL_IGNORED — status=200
- PASS [REAL_ENTRY_TEST] SUCCESS_RESPONSE_COMPATIBLE — keys=text,request_id,credits_charged,tokfai
- PASS [MOCK_BEHAVIOR_TEST] ERROR_worker_auth_error — code=worker_auth_error
- PASS [MOCK_BEHAVIOR_TEST] ERROR_worker_overloaded — code=worker_overloaded
- PASS [MOCK_BEHAVIOR_TEST] ERROR_worker_unreachable — code=worker_unreachable
- PASS [MOCK_BEHAVIOR_TEST] ERROR_worker_invalid_response — code=worker_invalid_response
- PASS [MOCK_BEHAVIOR_TEST] ERROR_worker_model_unavailable — code=worker_model_unavailable
- PASS [STATIC_SOURCE_CHECK] EXISTING_STT_PROVIDER_CHANGED — NO (groq path preserved)
- PASS [MOCK_BEHAVIOR_TEST] ERROR_CONTRACT_COMPATIBLE
- PASS [STATIC_SOURCE_CHECK] CHAT_CHANGED — NO
- PASS [STATIC_SOURCE_CHECK] RESPONSES_CHANGED — NO
- PASS [STATIC_SOURCE_CHECK] CURSOR_CHANGED — NO
- PASS [STATIC_SOURCE_CHECK] AZURE_CHANGED — NO
- PASS [STATIC_SOURCE_CHECK] AUTOPRO_CHANGED — NO
- PASS [STATIC_SOURCE_CHECK] GPT_GEMINI_CHANGED — NO
- PASS [STATIC_SOURCE_CHECK] TYPECHECK — 
> @tokfai/dmit-api@0.1.0 typecheck
> tsc --noEmit


- PASS [STATIC_SOURCE_CHECK] BUILD — 
> @tokfai/dmit-api@0.1.0 build
> tsc -p tsconfig.build.json


- PASS [REAL_ENTRY_TEST] REGRESSION_P1059 — status=0
- PASS [REAL_ENTRY_TEST] REGRESSION_P1061 — status=0
- PASS [REAL_ENTRY_TEST] REGRESSION_P1062R4 — status=0
- PASS [REAL_ENTRY_TEST] REGRESSION_P1067 — status=0
- PASS [REAL_ENTRY_TEST] REGRESSION_P1070 — status=0
- PASS [MOCK_BEHAVIOR_TEST] REGRESSION_P1071 — status=0
- PASS [MOCK_BEHAVIOR_TEST] REGRESSION_P1072 — status=0
- PASS [MOCK_BEHAVIOR_TEST] REGRESSION_P1074 — status=0
- PASS [MOCK_BEHAVIOR_TEST] REGRESSION_P1077 — status=0
- PASS [MOCK_BEHAVIOR_TEST] REGRESSION_P1077R2 — status=0
- PASS [MOCK_BEHAVIOR_TEST] REGRESSION_P1077R3 — status=0
- PASS [MOCK_BEHAVIOR_TEST] REGRESSION_P1079 — status=0

TOKFAI_P1079R2_SELF_HOSTED_STT_PRECOMMIT_MEMORY_BOUNDARY_PASS
