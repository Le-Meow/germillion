# Traffic readiness

Backend hardening verified locally on Windows / Node 24.19.0, 28 September 2026. This is not a Cloudflare production capacity guarantee.

## Implemented

- Static assets use Cloudflare's asset service; only `/api/*` and `/healthz` invoke the Worker.
- Catalogue lookups, score ranks and top answers compile once per Worker isolate. Reviewed aliases retain their existing meaning; fuzzy suggestions never count automatically.
- Unique database indexes enforce one daily per player/day and one defence per attack. Conditional updates make concurrent answers converge on the first saved answer. A test sends 100 final answers concurrently and checks that only one result is counted.
- Migration `0002_traffic.sql` maintains completed-result summaries, daily score counts, attack membership and all-time rivalries atomically through database triggers. Existing saves backfill once. The chart reads at most 1,025 score buckets, irrespective of player count; it does not load every player's run.
- Attack history reads the latest 200 indexed memberships, even for a popular streamer link. Rivalry totals retain all matches; the view lists the 100 most-played rivals. Link defender counts include all attempts.
- New-run and feedback quotas are conditional database inserts, safe against simultaneous requests. Cloudflare IP rate limits run before player/database work. Limits are safeguards, not a global bot or spend cap; shared-IP groups can also hit them.
- Busy databases return HTTP 503 with Retry-After. The browser retries safe operations once with a delay and jitter. It does not automatically duplicate practice creation, feedback, or recovery operations. HTTP 429 backs off automatic timer submissions.

## Reproduce

`npm test`

`node scripts/load-traffic.mjs 1000 10000 200`

Arguments: player count, seeded daily count (also seeds that many defences of one popular attack), maximum simultaneous HTTP requests. The harness starts a separate real Node HTTP server and disposable SQLite database in the OS temp directory. It validates seven accepted answers per player, invalid-answer retries, exact daily counts, and full rivalry totals. It does not write to local saved games or a hosted service. Rounds run immediately, without animation or think time, creating accelerated bursts.

Measured results for the command above:

| Measure | Result |
| --- | --- |
| Players completing seven rounds | 1,000 |
| Requests in flight | Up to 200 |
| Historical daily / defence runs | 10,000 / 10,000 |
| HTTP requests / failures | 18,001 / 0 |
| Game workload time / throughput | 55.05 s / 327 requests/s |
| Request latency p50 / p95 / p99 | 439 / 1,229 / 1,614 ms |
| Popular attack log | 42 ms |
| Final histogram rows / players | 1,025 / 11,000 |

An earlier 500-request burst completed 500 games without errors. An uncapped 1,000-request burst failed with a local ECONNRESET; the root cause was not established. The 200-request limit in the reproducible harness controls the test generator, not production admission. Do not describe the result as a proven 1,000-request simultaneous capacity.

Cloudflare D1 local migration, Worker dry-run bundle, and emulator practice/attack/counterattack/recovery smoke checks also passed. Local SQLite does not model D1 network latency, queues, quotas or CPU limits.

## Before streamer promotion

1. Finish authorized Cloudflare account access, provision a separate Germillion D1 database, apply migrations and deploy. The zero database UUID remains a local placeholder. Upgrade the Workers account with the user's approval before promotion.
2. Run the smoke test against the real HTTPS deployment. Rehearse expected audience arrivals against an isolated staging Worker/D1 database, including clustered final submissions, popular attack links, wrong guesses and multiple regions. Measure latency, errors/429/503s, Worker CPU, D1 query duration/rows read/written and storage. Test above the expected launch rate; do not reuse the localhost-only harness against live ranked games.
3. Configure usage/error alerts and verify a backup restore. Review IP limits for shared networks and the paid plan's actual quotas. No alert destination, paid upgrade or production restore is configured yet.

A single D1 database still serializes queries: upgrading quotas alone is not unlimited write throughput. If the live rehearsal queues or overloads, profile query/trigger costs and reduce work before promotion; partition storage only if measurements require it. Do not add independent replicas of the Node SQLite file. Account limits, bot traffic and player growth still need monitoring.
