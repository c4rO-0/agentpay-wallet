# AgentPay Wallet progress

## Protocol dependency — 2026-11-19

Wallet now pins the published Protocol 0.14.4. An independent installation compiled and passed all 10 Settlement request checks. Publishing the next Wallet package and updating the paired User dependency are pending.

## Compatibility supplement — 2026-11-19

Completed R11 consumer/state compatibility review. [Dispositions and evidence](doc/records/compatibility-review-2026-11-19.md). Retained historical recovery and published interfaces have explicit exit conditions; no release or deployment.

## Dispute API consolidation — 2026-11-16

Removed the pre-launch direct dispute IPC/signing action. Order-scoped case access, case reads and result requests remain; filing uses the case API. Compilation and all 10 Settlement-request checks passed, including retired-action rejection. Source only; no package publication.


## Mainnet static review — source corrections complete, 2026-11-15

W1–W4 and the bounded transport/filesystem/input-error follow-ups are repaired.
The focused correction review is complete. Code comments explain signature,
transition-journal and service-ownership ordering; current guides are updated.
[Findings, corrections and evidence](doc/records/mainnet-static-review-2026-11-15.md).

All 36 behavioral checks passed, including real competing processes, forced-exit
recovery, unlock cancellation and audit failures. Independent tarball installation,
public declarations, CLI and real IPC lifecycle also passed. Controlled RPC fixtures
verify wrong-chain rejection and bounded waits; no live payment was performed.
The new native file-lock dependency was verified on this Linux host only.
R1–R10 coverage is complete and ready for the review closeout commit; no release
has occurred. Published Wallet remains 0.3.5.
Protocol dependency remains 0.14.3 pending its separately authorized release.

## Published baseline

Wallet 0.3.5 is the latest release recorded here. Tag `v0.3.5` identifies
`73d5d302c707213c9e9e84566a4a1ad44727f6d3`; npm archive integrity was verified.
It includes nickname validation, RPC error guidance and maintenance guidance.
The current corrections above are not in that published version.

## Next steps

1. Commit this completed review; continue with User without a new broad rehearsal.
2. When authorized, publish an aligned version/tag and verify npm integrity.
3. Coordinate User’s exact Wallet dependency update and relevant integration checks.

The [TODO](doc/TODO.md) tracks remaining work and evidence limits.
[Earlier checkpoints](doc/archive/progress-through-2026-11-13.md) preserve release
history without making old next-step labels current requirements.
