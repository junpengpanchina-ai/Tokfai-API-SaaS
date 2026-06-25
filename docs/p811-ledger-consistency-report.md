# P811 Ledger Consistency Report

## Scope

This report verifies Tokfai production ledger behavior after gateway guard and load tests.

##fai production ledger behavior after gateway guard and load tests.

## Environment

- API base: https://api.tokfai.com/v1
- Runtime: DMIT production
- Process: pm2 dmit-api
- Reverse proxy: nginx
- Model alias tested: auto-fast
- Resolved model observed: gemini-3-flash

## Normal Load Test

- Total requests: 20
- Success: 19
- Failed: 1
- Success rate: 95%
- HTTP 200: 19
- HTTP 504: 1
- HTTP 429: 0
- Error code: upstream_timeout: 1
- Generic 502: 0
- Gateway crashed: no
- PM2 status after test: online
- Public health after test: HTTP 200

## Gateway Guard Load Test

- Total requests: 12
- Concurrency: 10
- Success: 5
- Failed: 7
- HTTP 200: 5
- HTTP 429: 7
- Error code: too_many_concurrent_requests: 7
- HTTP 502: 0
- Gateway crashed: no

## Healthcheck

- local_api: ok http_200
- public_api: ok http_200
- pm2: dmit-api online
- nginx: active
- ssl: certificate valid more than 14 days
- disk: root_disk_usage=28%
- final healthcheck: fail=0

## Ledger Verification

Usage log verification confirmed:

- Failed usage rows are not charged.
- 429 too_many_concurrent_requests rows are billable=false and credits_charged=null.
- Upstream failure rows are billable=false and credits_charged=null.
- Successful requests are charged.
- Usage and Credits pages reconcile request_id and credits.

## Conclusion

P811 passes the core production ledger safety gate.

Tokfai can handle normal small-batch production traffic and reject excessive concurrency with controlled 429 responses.

There is no generic 502 during gateway guard tests.

The remaining observed operational risk is upstream latency/timeout, represented as classified 504 upstream_timeout rather than generic failure.

## Next Recommended Step

P812 should focus on upstream timeout and fallback tuning:

- Reduce long-tail timeout impact.
- Improve auto-fast fallback behavior when one provider/model is slow.
- Add stronger timeout budget visibility in logs.
- Keep failed/timeout requests non-billable.
