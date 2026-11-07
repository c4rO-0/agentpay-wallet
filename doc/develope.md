# Developer guide

## Start with a standalone checkout

Follow [README](../README.md) to install Node/pnpm dependencies and build Wallet.
No User or Settlement checkout is required for `pnpm test`. Tests use disposable
keys, temporary directories and controlled local sockets/HTTP endpoints. They do
not require a live chain, database or real spending permission.

For a memory-constrained machine, run the same suite sequentially:

```bash
pnpm build
node --test --test-concurrency=1 dist/test/*.test.js
```

Run commands from the Wallet repository so fixture paths resolve correctly.
The suites include real Wallet process restart against controlled upstream fixtures;
they are not a full deployed-platform or real-network acceptance test.

## Read the code in this order

1. [Architecture](architecture.md): modules, data files and trust boundaries.
2. `src/ipc.ts`: who may call which methods; `src/cli.ts`: the standalone entry.
3. `src/wallet.ts`: follow `signAgentPayCommitment` into `commitment.ts` and then
   `keystore.ts`; note checks repeated after asynchronous work.
4. Follow `readSettlementOrder` through `settlement-http.ts`,
   `settlement-request.ts` and `signHistoricalOrderRead`.
5. Follow restore/renew/migration journal transitions before modifying identity or
   persistence. Read their tests beside the implementation.

The `Phase0*` source names are retained exports; they use the current v1 binding.
Do not infer a disposable/demo security boundary from those names.

See the [test directory guide](../test/README.md) for coverage, fixture boundaries
and focused execution.

## Choose the behavior test

| Change | Tests to read/run |
| --- | --- |
| Lock/unlock, key lifecycle, IPC roles, structured signatures | `lifecycle.test.ts`, `service-ready-ipc.test.ts` |
| Original key/Policy restore | `policy-restore.test.ts` |
| Renewal and migration/restart | `policy-renewal.test.ts`, `policy-migration.test.ts` |
| Original-Policy reads and request selectors | `historical-order-read.test.ts`, `settlement-request.test.ts` |
| Market connection proof and Agent denial | `market-connection.test.ts` |
| Cancellation and response identity | `order-cancel.test.ts`, transport tests |
| Protocol dependency upgrade | Independent frozen installation and the Wallet behavioral suite |

Example after a build:

```bash
node --test --test-concurrency=1 dist/test/policy-migration.test.js dist/test/lifecycle.test.js
```

Test observable results, rejected authority and recovery outcomes. Keep precise
hash/signature/time/amount negatives where they protect a distinct boundary. Avoid
tests that merely search source text or assert private implementation layout.

## Write maintainable changes

Use ordinary multiline control flow and names that expose units. Comments should
explain trust, ordering or recovery decisions. Avoid repeating assignments or
promising guarantees that a downstream component actually enforces. Formatting uses
Prettier 3.6.2 defaults; format only edited files and preserve canonical payload order.

Do not rename public fields/error codes, relax capability rules, broaden HTTP origins
or change persisted identity as a cleanup. Protocol changes need a compatibility
review. Use [contribution guidance](reference/CONTRIBUTING.md) for review expectations.

## Integration surface

Current compiled entry: `dist/src/index.js`; CLI: `dist/src/cli.js`. For a trusted
local integration, see [IPC reference](reference/local-ipc.md). Internal exported
classes are not a stable distribution contract or a sandbox. The supported client
boundary and independent version checks are [planned](plans/user-wallet-distribution.md).

Private platform scripts and records are deliberately absent. Public contributors
must not need private server source to build or test Wallet. Never place real keys,
private endpoint configuration, signed payloads or runtime data in test fixtures.
Report vulnerabilities through the [security policy](security/SECURITY.md).
