# Wallet behavior tests

Run from the repository root:

```sh
pnpm test
```

For a constrained machine or an easier-to-follow log:

```sh
pnpm build
node --test --test-concurrency=1 dist/test/*.test.js
```

Run one suite after building, for example:

```sh
node --test dist/test/policy-renewal.test.js
```

## Find a test

| Area | Files | What they demonstrate |
| --- | --- | --- |
| Key and process lifecycle | `lifecycle.test.ts` | Locked startup, real process restart, bounded signing, unsafe input denial and destruction |
| Authorization changes | `policy-restore.test.ts`, `policy-renewal.test.ts`, `policy-migration.test.ts` | Restore the original key/Policy; replace permission; migrate deployment without silently broadening authority; recover local interrupted transitions |
| Historical access | `historical-order-read.test.ts` | Verify original scope without rebinding or allowing new purchases |
| Market connection | `market-connection.test.ts` | Canonical short-lived proofs and denial through the Agent capability |
| Action transport | `settlement-request.test.ts`, `service-ready-ipc.test.ts`, `order-cancel.test.ts` | Scoped requests, response identity, timeouts, errors and IPC role boundaries |
| Response time fields | `order-time-transport.test.ts`, `finalization-time-transport.test.ts`, `notice-delivery-time-transport.test.ts` | Distinct Order, non-Order finalization and notice/delivery response paths; normalize public wire fixtures and reject invalid responses |

Keep the flat layout while there are few suites: it supports the existing test glob
and lets contributors find a feature directly. The long restart tests are sequential
journeys; their later assertions depend on the preceding process/storage transition.

## What is real, and what is simulated?

Tests create disposable local keys, files, sockets and (where specified) Wallet
processes. HTTP/RPC servers return controlled responses. The three time-transport suites use
the real HTTP client with a stub signer, not the Wallet IPC server. Public Protocol fixtures
come from the pinned dependency. No private Settlement checkout, live chain,
database, Market account or real funds are required.

A local recovery test proves the tested Wallet transition, not a complete platform
refund or real-network recovery. Chain writes, owner signing and deployed purchase
acceptance require separate integration evidence.

## Adding or changing coverage

- Start from a user-visible behavior or a specific rejected authority boundary.
- Keep setup, action and assertions readable; explain unusual fixture state or
  ordering, rather than narrating each assertion.
- Use temporary directories and loopback ephemeral ports. Close servers/processes
  and remove disposable files in cleanup, including failure paths.
- Keep exact hash, expiry, amount and capability checks when they protect distinct
  signing boundaries. Similar validation at signing and IPC boundaries is not
  automatically duplicate coverage.
- Do not add source-text matching, real credentials, private operational records or
  assertions tied only to helper layout. Prefer a focused regression in the suite
  that owns the behavior.

## Behavioral review — 2026-11-06

- Retain real CLI/process lifecycle, IPC capability, signing and local storage
  journeys. Payment limits and duplicate rejection are exercised through Agent IPC;
  Market connection includes a successful admin proof verified with the public
  EIP-712 envelope, as well as denial to Agent callers.
- Keep focused amount/identity/hash/expiry validation. Consolidate the duplicate
  expired-permission assertions into one action table in `settlement-request`.
  Move accepted-price-term checks into action normalization, where they belong.
- Keep separate response tests for Order, finalization, authorization and notices:
  they validate distinct response paths. Do not call stub-signer HTTP tests IPC
  or full transaction tests.
- The retired vendored-archive test is no longer needed with npm distribution.
  Dependency integrity is pinned in the frozen lockfile; verify upgrades through
  independent installation and the Wallet behavioral suite.
- Remove incidental memory/timing-metric assertions from the key lifecycle test.
  Keep audit timestamp and secret/signature exclusion checks.
- Historical-read prerequisites use `bindPolicy`, rather than writing a binding
  file directly. Lifecycle tests clean up child processes even when assertions fail.

### Recovery evidence limits

`policy-migration` kills a real child process after preparation and verifies its
pending state after restart. Its partial-binding checkpoint is separately prepared
by writing a fixture file. `policy-renewal` prepares a pending journal from a
completed renewal and reopens Wallet in the same process. These latter cases are
stored-state regressions, **not** evidence of a real crash between atomic writes.

`order-cancel` recreates the IPC server in the same test process. It checks that the
original identifiers survive retry; a fixture's `duplicate` flag does not prove
Settlement refund idempotency. Full cross-component cancellation and mid-write
crash acceptance remain separate work; no production test branches were added.
