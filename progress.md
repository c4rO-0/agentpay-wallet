# AgentPay Wallet progress

## Wallet 0.3.6 — published 2026-11-19

Tag `v0.3.6` points to `0a1abbb`. The registry archive matches the independently installed and tested archive byte for byte. All 37 Wallet checks passed on Linux, including service ownership and Settlement requests. This release pins Protocol 0.14.4.

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
Wallet 0.3.5 was the participant baseline before these corrections. Its tag is `v0.3.5` at `73d5d30`.

The [TODO](doc/TODO.md) tracks remaining work and evidence limits.
[Earlier checkpoints](doc/archive/progress-through-2026-11-13.md) preserve release
history without making old next-step labels current requirements.
