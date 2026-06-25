# P810 Gateway Load Acceptance Report

## Result

P810 PASSED.

## Normal load test

- Endpoint: https://api.tokfai.com/v1/chat/completions
- Model: auto-fast
- Total requests: 20
- Concurrency: 2
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

## Gateway guard load test

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

## Conclusion

The gateway can handle normal small-batch traffic and reject excessive concurrency with controlled 429 responses.
Failures are classified and traceable by request_id.
No generic 502 occurred during the acceptance test.
The remaining risk is upstream latency/timeout, observed as one 504 upstream_timeout during the normal load test.

## Follow-up

P811 should verify ledger consistency:

- Successful requests are charged.
- 429 too_many_concurrent_requests is not charged.
- 504 upstream_timeout is not charged.
- Usage and Credits pages reconcile request_id and credits.
