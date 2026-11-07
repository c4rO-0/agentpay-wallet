# AgentPay Wallet progress

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

Integration limit: AgentPay User's `checkUpdatePair` still requires both repositories
to use the old archive dependency. This Wallet revision is independently verified,
not yet a compatible User/Wallet release pair. Next loop must migrate User imports,
lockfile and pair metadata/checks together before guided install/repair acceptance.
No fallback alias or bypass was added. Existing dated source-review records describe
the earlier archive state and remain historical evidence.


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
