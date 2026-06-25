# P813 Production Gateway Acceptance Report

## Scope

This report summarizes the current production acceptance status for Tokfai API Gateway after P806-P812.

## Production Base

- Public API: https://api.tokfai.com/v1
- Backend service: dmit-api
- Runtime: PM2
- Reverse proxy: Nginx
- TLS: Let's Encrypt
- Main chat model route: auto-fast
- Resolved default model observed: gemini-3-flash

## Healthcheck

Current healthcheck result:

- local_api: ok http_200
- public_api: ok http_200
- pm2: dmit-api online
- nginx: active
- ssl: certificate valid more than 14 days
- disk: root_disk_usage=28%
- final healthcheck: fail=0

## Normal Load Test

Normal load test result:

- Endpoint: https://api.tokfai.com/v1/chat/completions
- Model: auto-fast
- Total requests: 20
- Concurrency: 2
- Success: 20
- Failed: 0
- Success rate: 100%
- HTTP 200: 20
- HTTP 429: 0
- HTTP 502: 0
- HTTP 504: 0
- Generic 502: 0
- Gateway crashed: no
- PM2 status after test: online
- Public health after test: HTTP 200

## Gateway Guard Load Test

Gateway guard test result:

- Total requests: 12
- Concurrency: 10
- Success: 5
- Failed: 7
- HTTP 200: 5
- HTTP 429: 7
- Error code: too_many_concurrent_requests
- HTTP 502: 0
- Gateway crashed: no

Conclusion: excessive concurrency is rejected with controlled 429 responses instead of crashing the gateway.

## Ledger Verification

Usage log verification confirmed:

- Successful requests are charged.
- Failed usage rows are not charged.
- 429 too_many_concurrent_requests rows are billable=false and credits_charged=null.
- Upstream failure rows are billable=false and credits_charged=null.
- Usage and Credits pages reconcile request_id and credits.

## Timeout Tuning

Timeout values after P812:

- GRSAI_CHAT_TIMEOUT_MS=45000
- TOKFAI_UPSTREAM_TIMEOUT_MS=45000
- TOKFAI_TOTAL_REQUEST_TIMEOUT_MS=75000
- GRSAI_IMAGE_REQUEST_TIMEOUT_MS=120000
- IMAGE_REQUEST_TIMEOUT_MS=120000

Result after tuning:

- 20-request / concurrency-2 test completed successfully.
- No 504 upstream_timeout observed in the latest pass.
- Long-tail latency still exists, but it is classified and bounded.

## Security Baseline

Confirmed:

- API backend binds to 127.0.0.1:8787
- Public port 8787 is not exposed.
- Public access goes through Nginx on 80/443.
- HTTPS is active.
- PM2 resurrect is configured.
- Healthcheck timer is enabled.
- SSH key login for deploy works.
- Root SSH login is denied.
- Password SSH login is denied.
- .env permission is restricted to deploy:deploy 600.

## Current Production Position

Tokfai API Gateway can handle normal small-batch production traffic and reject excessive concurrency with controlled 429 responses.

The gateway currently provides:

- API Key authentication
- OpenAI-compatible /v1/models
- OpenAI-compatible /v1/chat/completions
- /v1/responses compatibility
- Smart model routing through auto-fast
- Usage logging with request_id
- Credits debit only on successful billable requests
- Failure classification
- Controlled 429 concurrency protection
- HTTPS reverse proxy
- PM2 process recovery
- Systemd healthcheck timer

## Remaining Risk

The main remaining operational risk is upstream latency / timeout from GRSAI.

This is not currently a generic gateway failure. It is classified as upstream_timeout when it occurs.

## Next Recommended Phase

P814 should focus on customer-facing integration acceptance:

- Cursor
- Cherry Studio
- OpenAI SDK
- curl
- /v1/responses
- Usage/Credits reconciliation after external client calls

P815 should focus on long-run stability:

- 100-request soak test
- 1-hour healthcheck observation
- access/error log review
- ledger reconciliation after soak
