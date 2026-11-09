# Member usage validation

The panel displays host projection snapshots. It does not run a model or calculate prices.

The inspected official DSH 0.2.2-rc.1 package exposes flat `tokenUsage` counters and flat `contextBreakdown` fields in `dsh-token-meter/lib/types/projection.d.ts`; the reader also accepts wrapped `totals` / `breakdown` records. Four provider token buckets are disjoint; reasoning is already included in output. Breakdown segments are heuristic composition, not provider usage. Context pressure and capacity are last-known observations and need not describe the same request.

`ISessions.refreshProjections` is a public ensure/retry operation. In the inspected `dsh-api-session-controller/lib/types/client/sessions/manager.js`, a ready projection load returns immediately. Calling it is not a forced new RPC and cannot guarantee fresh final numbers. The panel ensures every member initially, attempts another read on running/stopped transitions, retries while running at five-second intervals, and consumes projection changes from `useSessions`. No timer remains while all members are stopped or the service is absent. Missing fields display a dash; values remain snapshots, not guaranteed billing totals.

## Isolated browser fixture

`scripts/test-panel-browser.mjs` bundles production code with real React DOM. Set `DSH_BROWSER_TEST_ROOT` to an isolated npm installation containing `react`, `react-dom` and `esbuild`; open the printed loopback URL and run lifecycle checks. It uses synthetic team/projection/service records and never connects to a running DSH process or user profile.

Chrome validation on 2026-11-09 passed 11 lifecycle assertions: empty team, team arrival, late service plus idle initial reads, running transition, stopped read/timer cleanup, team disappearance, no nested buttons, one subject navigation, one row navigation, blocker toggle without navigation, and unmount cleanup. Native Enter on the task subject and Space on the member button each opened once; Owner Enter opened once and blocker Space did not navigate. At a 340px panel width, scrollWidth equalled clientWidth. This is real React/browser validation with service fixtures, not a real-team or model end-to-end test.

No user DSH process was restarted. Only the fixture's own temporary server was stopped after testing.
