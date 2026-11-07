# Wallet Development Instructions

## Behavior-first verification — 2026-11-06

- Prefer end-to-end tests through real product entry points and public interfaces.
  Test observable behavior and user outcomes, not internal implementation shape.
  Use real processes, storage and Anvil where the claim depends on them; do not
  substitute direct database writes or internal-state injection for the workflow
  being accepted. Controlled fixtures may prepare prerequisites.
- Select meaningful complete journeys and failure boundaries: independent install/
  package consumption, authorization, payment, delivery, settlement/refund, denied
  access, duplicate requests and interrupted-operation recovery as applicable.
  A test should demonstrate a functional requirement or a concrete regression.
- Avoid tests that merely mirror implementation, assert source text/private helper
  structure, or repeat the same coverage without a distinct failure boundary.
  Syntax, type and build checks are useful checks, not functional acceptance.
- Keep focused tests for signatures, canonical hashes, amount/time boundaries,
  authorization and concurrency invariants when they give precise protection that
  end-to-end tests alone cannot efficiently provide. End-to-end preference does
  not remove negative security or financial-boundary coverage.
- Review existing tests by the same standard. Consolidate redundant tests only
  after equivalent meaningful coverage passes; do not delete a regression merely
  because it is a unit test. Do not inflate test counts as a measure of readiness.
- Label mocked external dependencies and evidence limits explicitly. Simulated
  success does not prove real process recovery, real payment or participant usability.
  Keep tests bounded to the change and use maintained fixtures; this principle does
  not authorize live funds, public-network operations, destructive resets or broad
  resource-heavy test runs.



## Network portability invariant — 2026-11-04

Develop and verify the same product flows on Anvil. Moving to a supported EVM
network must use configuration, deployment artifacts and explicit signer selection,
not a separate implementation of authorization, payment or recovery. External-owner
signing must be testable against Anvil as well. Keep test signer guards and private
reset/funding tools restricted; never remove them to make a product entry portable.
Chain ID is identity, not permission to select an unlocked test signer. Network
capabilities/finality and deployment addresses are explicit validated settings.
Changing networks never silently rewrites saved Policies, Orders or request identity.
Anvil results do not establish real-network compatibility or release approval.

## Wallet identity priority — 2026-10-31

Read `doc/reference/wallet-identity.md` before connection/recovery work.
Market identity is network/Module/Safe/delegate; nickname belongs to this tuple,
while each Policy remains an independently verified Order-access scope. Do not
merge by Safe/name alone or create device IDs. Use current progress and dated acceptance to determine remaining work; historical
implementation pauses are not current blockers. Do not
silently reinterpret existing connection IDs, reset data or broaden authority.


Wallet is the user-side signing boundary. The User grants one bounded Safe
Policy; normal eligible purchases must not require a new owner-wallet
confirmation. The Session Key never enters Settlement, Skill, Market, logs,
or generic signing APIs. Local lock is not chain revocation. Wallet exposes
only narrow AgentPay signing and administration operations, and independently
checks qualification before signing.

Read `README.md`, `progress.md`, `doc/architecture.md`, and `doc/TODO.md`.
Check this repository's Git status before editing. A separate platform
workspace may add operational instructions, but this file stands alone for
the public Wallet repository.
Changes to signing, policy, storage, IPC, or authentication require negative
tests and an explicit threat-boundary review.

## Documentation navigation

Use `doc/README.md` to select documents by role and function. Keep current work in
`progress.md` and `doc/TODO.md`; put dated verification in `doc/records/` and superseded
chronology in `doc/archive/`. Archived pending tasks do not authorize repeating old
operations. Keep this repository independently readable; do not link parent workspace
documentation. Update local links and the catalog when reorganizing documents.

## Public source hygiene

Treat tracked files and release archives as public. Keep local configuration, keys,
capability tokens, logs and signed payloads out of Git. Test credentials must be
clearly disposable fixtures. Default build/tests must work without a parent workspace;
label cross-repository experiments separately. Public visibility does not authorize
package publication, real funds or a history rewrite.

## Contributor readability

Keep the source map in `doc/architecture.md` and interface examples in
`doc/reference/` aligned with the implementation. Explain authority checks, signed
bytes, concurrency and recovery decisions in comments; avoid comments that merely
repeat syntax. Distinguish local snapshots from verified chain state and future
plans from available behavior. Format code consistently, preserve signed payload
ordering, and avoid unrelated behavioral changes during documentation polish.

## npm package boundary

Public package entries are `src/client.ts`, `src/local.ts` and
`bin/agentpay-wallet.mjs`. Keep Agent/Runtime IPC calls separate from trusted local
administration. Do not expose generic signing or internal keystore/file helpers to
avoid adapting a consumer. Verify artifact changes with `pnpm test:package`; it
installs a tarball outside the checkout and exercises real IPC/process behavior.
Keep tests, fixtures, keys and source maps out of the package. Package publication
remains a separate approval; `private: true` intentionally blocks it for now.
