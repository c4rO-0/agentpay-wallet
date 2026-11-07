# Wallet TODO

## npm client distribution — 2026-11-07

- [x] Record npm-first plan; combined source ZIP is optional, not the primary installer.
- [x] Step 1: commit verified User/Wallet Protocol dependency migration baseline.
- [x] Step 2: prepare Wallet public entry points, compiled npm artifact and standalone acceptance (29 behavioral tests plus installed-package CLI/IPC lifecycle).
- [ ] Step 3: migrate User to Wallet npm dependency and `agentpay` entry; remove sibling/build assumptions.
- [ ] Step 4: installed/running compatibility, upgrade recovery and explicit uninstall modes.
- [ ] Step 5: publish Wallet then User via OIDC; verify registry installs and update Market guides.
- [ ] Step 6: participant setup/upgrade/restart/uninstall and official Anvil paid acceptance.


## Public Protocol npm dependency

- [x] Pin npm core 0.14.3; update imports, fixture resolution and lockfile.
- [x] Verify independent install/build and all 29 behavioral tests; unchanged Protocol runtime bytes.
- [x] Retire vendored archive and obsolete archive-manifest test; review current guides.
- [x] Coordinate User dependency/pair-check migration; isolated installer preparation and User suite passed.
- [ ] Commit/push the matching User and Wallet revisions before participant synchronization.


## Public-source preparation

- [x] Review current tracked source and archive contents for sensitive material.
- [x] Remove private integration scripts/records and all old Protocol archives from the public tree.
- [x] Rebuild the required types package from reviewed public Protocol; update manifest and lock integrity.
- [x] Correct standalone guides, missing secret ignores, security contact and stale test expectations.
- [x] Independent frozen install/build and all 31 local tests passed with the new public-source archive.
- [x] Polish contributor reading paths, source navigation, IPC reference and security-boundary comments; reverify build/tests and local links.
- [x] Organize test readability and coverage navigation; preserve distinct boundary coverage and rerun all 31 tests.
- [x] Review each test suite against behavior-first principles; consolidate duplicate rules, remove out-of-scope Protocol checks and improve real IPC coverage.
- [x] Rebuild and rerun the final combined revision independently: all 30 tests passed, with no failures or skips.
- [x] Obtain owner approval for a single-commit history baseline and removal of old release tags.
- [x] Owner enabled public source; anonymous refs show only main `fb70187`, with no old tags.
- [ ] Verify a complete anonymous fresh clone and source ZIP installation.
- [ ] Establish public CI for the independent behavioral suite; no private platform dependencies.

## Independent distribution

- [x] Record [approved distribution direction](plans/user-wallet-distribution.md).
- [ ] Define stable public client/IPC compatibility, including source/build/running identity.
- [ ] Integrate User compatibility checks and verify supported unequal versions and rejection/recovery paths.
- [x] Prepare and independently test standalone Wallet npm artifact; publication remains pending.

## Remaining acceptance and release gates

- [ ] Broaden controlled installation, original-key restore, Policy renewal/revocation,
  mixed-version recovery and historical scope isolation acceptance.
- [ ] Verify supported external-owner/multisig/headless scope and same-code network deployment.
- [ ] Resolve live revocation/readiness UX and independent on-chain versus local-snapshot guarantees.
- [ ] Verify real interruption at renewal/migration write boundaries; prepared journal fixtures are regression coverage, not crash acceptance.
- [ ] Verify financial race/recovery cases with owning platform components and exact reconciliation.
- [ ] Independent security review, release provenance and supported-version policy before real funds.
- [ ] Keep macOS startup and graphical unlock deferred until a testable scope is agreed.

Private chronological tasks were preserved outside this public repository during
cleanup. Their removal from publication is not cancellation or acceptance.
