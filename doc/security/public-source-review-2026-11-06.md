# Wallet public-source review — 2026-11-06

## Scope

Review current Wallet source, documentation, tracked dependency archives and
standalone build/test entry points. This is source-publication hygiene, not an
independent cryptographic audit or real-funds acceptance. Old Git history has not
been approved for publication; owner-approved history cleanup remains required.

## Findings and changes

- No actual credential was identified in pattern scanning and review of matches.
  Initial archive inspection included 580 members across retained Protocol packages.
  Matched passwords/keys were disposable test fixtures or interactive input labels.
  This bounded review is not a guarantee that no unknown secret pattern exists.
- By owner instruction, all old Protocol archives, platform integration scripts,
  internal experiment records and private chronology were removed from the public
  tree. Private traceability is retained outside this repository.
- The one required types archive was rebuilt from public Protocol commit
  `1c6ffab3a325579ecfa165e3e5e5a9dc6d3e6ab1`. Its 76 members contain public types,
  schemas, fixtures and package documentation, not Settlement implementation.
  Manifest and frozen lockfile now identify the actual installed bytes. MIT notice
  accompanies the archive. No private legacy archive was reused.
- The previous manifest named 0.13.0, the test expected 0.11.1 and the dependency
  was 0.14.1. The test now checks selected manifest, dependency and installed version
  together, plus digest and public protocol behavior.
- Two stale behavior assertions were corrected: local status includes recoveryScope;
  short existing-Order requests remain available after spending expiry while new
  order.prepare requests and overlong support signatures are rejected.
- Added environment/log/key ignore rules and discoverable contribution/security
  entries. Corrected installation, role boundaries and stale documentation.
- Runtime signing and payment code is unchanged. Public requests to Settlement are
  necessary Wallet integration contracts; private Settlement code is excluded.

## Verification

Independent temporary source installation with the frozen lockfile and build
passed. All 31 local tests passed with `node --test --test-concurrency=1`, including
real local Wallet process restart, capability separation and controlled recovery.
No sibling User/Settlement checkout, live chain or database is required. Fixtures
use temporary keys/data and local RPC/HTTP/socket mocks. This does not establish
live-network or production platform acceptance.

## Community readability follow-up

The documentation catalog now separates operator, contributor, integrator and
security-review paths. Architecture includes a source map; the local IPC reference
includes capability roles and a read-only example. Current identity semantics moved
from a historical plan to reference documentation. Recovery and connection guides
now distinguish spending expiry from original-Order read access.

All 16 source modules were formatted and annotated at trust, signing and recovery
boundaries. A normalized syntax-tree comparison (ignoring comments, formatting and
redundant parentheses) found no structural changes. The independent build and all
31 tests passed again; local Markdown links resolve. These checks do not constitute
a comprehensive security audit.

The 13 test suites were also formatted and annotated, with a feature-based test
directory guide. Assertions and syntax structure were preserved. Standalone build
and all 31 tests passed again after this follow-up. No coverage was removed merely
for checking similar rules at different authority/response boundaries.

## Behavior-first test review

All 13 suites were reviewed by responsibility and evidence boundary. Duplicate
expired-permission checks were consolidated; unrelated Controller ABI/private
request hashing checks were removed from the Wallet packaging test. Incidental
performance-metric assertions were removed, retaining audit secrecy/time checks.
Market proof success now goes through real admin IPC and signature verification;
payment limits, expiry and duplicate signing are checked through Agent IPC.
Historical-read setup uses public binding, and lifecycle failures clean up children.

Recovery fixture checks remain useful regressions but no longer claim injected
crash acceptance. The [test guide](../../test/README.md) records all suite decisions
and the remaining recovery limits. No production behavior or test-only production
branch was changed.

Standalone build and the revised 30-test suite passed. After adding the final IPC
payment-limit assertions, build and all five lifecycle tests passed again. Local
link and whitespace checks passed. The earlier 31-test/AST results above describe
the formatting-only stage; they are not the final test count or evidence that
assertions remained unchanged during this subsequent behavioral revision.

## Final combined-suite execution

After all test revisions, the final source and tests were copied into the independent
checkout and rebuilt. The complete suite ran with
`node --test --test-concurrency=1 dist/test/*.test.js`: **30 passed, 0 failed,
0 skipped**, approximately 31 seconds. No live platform service, database or chain
was contacted and no payment was made. This supersedes the split full/focused run
as the verification of the final combined revision.

## Remaining publication gates

The owner approved a single-commit history reset and force push on 2026-11-06.
Public visibility remains a separate decision.
Deleting files in a new commit does not remove them from old reachable commits,
tags, pull requests, release assets or previously shared clones. Verify public
checkout after publication. Independent release/compatibility and public CI remain
separate tracked work; no packages or services were published by this review.
