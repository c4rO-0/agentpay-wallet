# Wallet TODO

## Tag-triggered publication

- [x] Use matching `vX.Y.Z` tags for npm publication; retain verification gates.
- [x] Owner confirmed release tags allowed in the GitHub `npm-publish` environment.
- [ ] Verify the first tag-triggered OIDC publication and registry integrity.

## Wallet 0.3.2 publication

- [x] Review package entries, running-version report, publishing workflow and current guides.
- [x] Remove obsolete source-only and integration-pending instructions.
- [x] Verify the 0.3.2 standalone archive and all 30 current behavioral checks.
- [x] Wallet 0.3.2 OIDC run 42490583169 succeeded; public integrity/provenance verified.
- [ ] Update User to the published exact Wallet dependency and verify the pair.

## Software reporting release — 2026-11-07

- [x] Add process-start read-only software metadata, preserve Policy version semantics.
- [x] Verify lifecycle and installed-package IPC reporting.
- [x] Wallet 0.3.1 OIDC release and User 0.3.1 exact dependency adoption verified.

## npm client distribution — 2026-11-07

- [x] Record npm-first plan; combined source ZIP is optional, not the primary installer.
- [x] Step 1: commit verified User/Wallet Protocol dependency migration baseline.
- [x] Step 2: prepare Wallet public entry points, compiled npm artifact and standalone acceptance (29 behavioral tests plus installed-package CLI/IPC lifecycle).
- [x] Review step 2: guard normal packing against missing/stale builds, correct public-interface docs and verify a standalone TypeScript consumer.
- [x] Step 3: User 0.3.1 consumes Wallet 0.3.1 through npm and exposes `agentpay`.
- [x] Step 4 implementation: installed/running checks, upgrade recovery and explicit uninstall modes.
- [ ] Step 4 acceptance: participant published-version upgrade and interruption recovery.
- [ ] Step 5: publish Wallet then User via OIDC; verify registry installs and update Market guides.
  - [x] Wallet 0.3.0 first Token publication; registry integrity/latest and fresh public install/CLI/IPC verified.
  - [x] Validate Wallet/User Trusted Publishers through the 0.3.1 OIDC releases. Market guide updates remain pending.
- [ ] Step 6: participant setup/upgrade/restart/uninstall and official Anvil paid acceptance.


## Public Protocol npm dependency

- [x] Pin npm core 0.14.3; update imports, fixture resolution and lockfile.
- [x] Verify independent install/build and all 29 behavioral tests; unchanged Protocol runtime bytes.
- [x] Retire vendored archive and obsolete archive-manifest test; review current guides.
- [x] Coordinate User dependency/pair-check migration; isolated installer preparation and User suite passed.
- [x] Commit/push the published User/Wallet 0.3.1 pair.


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
- [x] Define public client/IPC exports and installed/running identity checks.
- [x] Integrate exact reviewed dependency checks and mismatch/recovery behavior.
- [ ] Later compatible-range/unequal-version support requires a separately verified matrix.
- [x] Prepare and independently test standalone Wallet npm artifact; 0.3.1 is published.

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
