# AgentPay Wallet progress

## Maintenance guidance — 2026-11-10

Added explicit maintenance guidance without automatic write retries or replacement
purchases. Controlled HTTP/IPC tests verify that retry retains original request
identifiers. This is source verification, not live financial acceptance. Changes
have not been published to npm.


## Wallet 0.3.2 published — 2026-11-08

GitHub OIDC run 42490583169 succeeded from `20a6127`. Public npm 0.3.2 integrity
matches the independently verified archive and exposes provenance. Tag `v0.3.2`
identifies that original release commit; it uses the previous manual workflow and
will not republish. Future release tags use the new tag-triggered workflow.
User 0.3.2 pins this release; its 380-test suite and independent installed-process
check passed, followed by successful tag-triggered OIDC publication. Participant
update acceptance remains pending.

## Tag-triggered publication — 2026-11-08

Wallet, Protocol and User release workflows now run on pushed `vX.Y.Z` tags.
Each validates its package version, runs existing verification, publishes with
OIDC and checks registry integrity. Branch pushes do not publish. No tag was
pushed or npm version published for this workflow change. Owner confirmed `v*` tags allowed in the GitHub
`npm-publish` environment; npm trust fields remain unchanged. YAML/shell checks and six executable tag/version guard cases passed
per repository (matching version, mismatch, branch, prerelease, leading zero and
newline rejection). Actual GitHub/OIDC execution remains pending.

## Wallet 0.3.2 release review — 2026-11-08

Prepared a documentation patch release: npm installation, public entries and User
pairing guides now describe the available integration. Signing, IPC permissions,
Policy handling and storage behavior are unchanged. TypeScript build and all 30 current behavioral checks
passed. The 0.3.2 tarball installed outside the checkout from public npm dependencies;
public TypeScript imports, CLI, IPC permissions, unlock and restart checks passed.
No live chain, payment or participant service was accessed.

Next: publish 0.3.2 with GitHub OIDC, confirm registry integrity and current npm
Trusted Publisher validation, then let User pin this reviewed version. The historical
0.3.1 run below does not verify a newly configured Trusted Publisher.

## Wallet 0.3.1 published — 2026-11-08

[OIDC publication](https://github.com/c4rO-0/agentpay-wallet/actions/runs/42440112081)
succeeded from `7e4d4fa`. Public npm metadata confirms Wallet 0.3.1 and Protocol
0.14.3; User 0.3.1 now pins this Wallet. Trusted publishing is validated. Earlier
candidate sections below are historical; participant upgrade acceptance remains open.

> Historical checkpoints below: publication-pending and next-step labels are
> superseded by the verified 0.3.1 release above and current TODO.

## Running software reporting candidate — 2026-11-07

Wallet 0.3.1 adds read-only `status.software`: package name/version, local reporting
interface version and Protocol dependency. Values are captured once at process start;
Policy `version` keeps its existing meaning. These are local compatibility diagnostics,
not remote attestation or authority to sign. No capability, signing or payment rules change.
Behavioral checks passed, including version preservation when installed files change.
The maintainer requested completion of this paired release on 2026-11-08.
Actual installed Protocol reporting and standalone tarball verification passed.
Next: publish Wallet 0.3.1 through OIDC before User pins the new package.
Wallet's Trusted Publisher is configured; first OIDC publication remains pending.

## Wallet first npm publication complete — 2026-11-07

`@c4roa0/agentpay-wallet@0.3.0` is public; npm `latest` is 0.3.0. The owner
published the verified artifact using a hidden-input Token. Registry SHA-512
integrity matches the local artifact. A fresh public-registry installation with
scripts disabled passed installed CLI and real IPC permission/unlock/restart checks;
disposable test data was removed. Source revision: Wallet `082a8db`.

The publication workflow is on GitHub, but Wallet's npm Trusted Publisher setup
and first OIDC publication remain unverified. User 0.2.0 still rejects this Wallet
pair; next development loop is User package adoption. No live Wallet services,
keys, Policies or Orders were changed. Earlier candidate sections record pre-release
evidence and are superseded for publication status by this section.


## Wallet package review follow-up — 2026-11-07

Review found a missing prepack build guard and stale internal-path examples in
packaged documentation. Wallet now rebuilds compiled files before normal npm pack;
installed tarballs need no build hook. Public client examples and package reading
paths are corrected. Clean independent pack/install, a TypeScript consumer and real
CLI/IPC unlock/restart checks passed. User integration remains the next loop;
Wallet 0.3.0 is still unpublished and intentionally rejected by User 0.2.0 pairing.


## Wallet npm candidate verified — 2026-11-07

Steps 1–2 complete: Protocol migration baseline committed; Wallet 0.3.0 candidate
provides public client/local-administration/CLI entries and compiled declarations.
Independent frozen install/build and 29 behavioral tests passed. The packed artifact
installed without sibling sources; real CLI/IPC checks passed for capability denial,
no generic signing, unlock and restart preserving the key while locking the service.
No npm publication, service restart or participant data change was performed.

Next: User consumes this reviewed Wallet package and resolves public entries instead
of sibling `dist/src` files. Current User 0.2.0 pair checks deliberately reject Wallet
0.3.0; do not update a participant Wallet alone. Publication remains blocked by
`private: true`; package and User integration must be completed before synchronization.


## npm client distribution plan — 2026-11-07

Approved npm-first distribution for Protocol, Wallet and User; separate repositories
and processes remain. Ordinary users will install User, which supplies a reviewed
compiled Wallet dependency. Combined source ZIP is optional later work. See the
local distribution plan for public entries, upgrades, service paths, private data
and uninstall boundaries. Steps 1–2 are authorized: commit the verified Protocol
dependency baseline, then prepare/test Wallet's public package. User package
integration and npm uploads are later loops; present sibling installation remains
until replaced and verified.


## User pairing follow-up — 2026-11-06

The matching User working revision now consumes npm Protocol 0.14.3 and updates
its exact pair check and vendor-free installer fingerprints. Isolated sibling install,
Wallet build, 364 User tests and actual prepare-only install/retry passed. Mixed old
archive/new npm checkouts are rejected. Both revisions must be synchronized together;
this is not independent-version compatibility or participant/live-network acceptance.


## Public npm dependency migration — 2026-11-06

Wallet now pins `@c4roa0/agentpay-protocol@0.14.3` from npm. Only imports and fixture
resolution changed; the lockfile records registry integrity without changing other
resolved dependencies. Independent temporary installation without a parent repository,
vendor directory or dist output passed frozen install, build and all 29 local
behavioral tests (zero failures/skips). Old versus installed Protocol comparison:
73 dist/schema/fixture files byte-identical. Removed the superseded archive-manifest
test and vendored archive/license/manifest; historical evidence is retained privately.
No running services, keys, Policies or Orders were changed.

Historical limit resolved in the subsequent User pairing loop above: the source
pair migrated to npm Protocol. The newer Wallet 0.3.0 package candidate now needs
its separate User integration; no fallback alias or pair-check bypass was added.
Existing dated source-review records remain historical evidence.


## Public documentation follow-up — 2026-11-06

The owner enabled public source visibility. Anonymous remote refs were verified:
only main `fb70187` was advertised, without tags. This verifies ref access, not
fresh-clone/ZIP installation or disappearance of every historical GitHub object.
README prerequisites now explain how to obtain Corepack. Current TODO separates
completed visibility/ref checks from remaining installation, release and audit gates.
No source behavior or live deployment changed in this follow-up.

## Public-source preparation — 2026-11-06

Current source review covers code, documentation and dependency archive contents.
No actual credential was identified in the bounded scan. MIT and security reporting
are present; environment/log ignore rules were strengthened. Current guides now
separate independent Wallet usage from User onboarding and scoped private evidence.
Private integration scripts, internal experiment records and old Protocol archives
have been removed from the public tree. The single required types archive is rebuilt
from public Protocol commit `1c6ffab`; its manifest/lock identify exact source and bytes.

Independent temporary-source frozen installation, build and all 31 local tests
passed with sequential execution; no sibling repositories were present. See
[review record](doc/security/public-source-review-2026-11-06.md) for final results.
Wallet runtime signing/payment behavior is unchanged.
Community readability polish reorganized the role-based catalog, source map and
current IPC/identity/recovery references. All 16 source modules were formatted and
given boundary/rationale comments; a normalized syntax-tree comparison found no
structural code changes. The standalone build and 31 tests passed again. Historical task records remain
in the private workspace; they do not ship with the public source.

Test behavior review subsequently removed unrelated Protocol ABI/hash assertions,
consolidated expired-permission checks and strengthened real IPC signing/payment
boundaries. Recovery fixture tests are explicitly distinguished from process-crash
acceptance. See the [test review and evidence limits](test/README.md). Production
behavior is unchanged; no test-only business branches were added. The final combined revision was rebuilt in the independent temporary checkout
and all 30 tests passed sequentially (zero failures or skips, approximately 31 seconds).

## Implemented boundaries

Wallet owns the encrypted Session Key, locked startup, narrow authenticated IPC,
bounded commitments, original-Policy requests and verified binding/migration/renewal.
User coordinates owner approval and guides; Wallet does not hold the Safe owner key.
The current design retains verified Policy scopes across Wallet identity grouping.
Private Anvil evidence is not real-network or complete platform acceptance.

## Next closed loops

Owner approved the clean-history baseline and force push on 2026-11-06.
Verify remote refs and public downloads before changing visibility, then address
[User/Wallet distribution](doc/plans/user-wallet-distribution.md): independent
repositories, combined ZIP, public client/interface compatibility instead of exact
version pairing. No new distribution implementation or visibility change yet.

[TODO](doc/TODO.md) retains current release and acceptance work. This snapshot is
the clean-history publication baseline; public visibility, package publication and
live deployment are separate actions. Old release tags must not expose retired files.
