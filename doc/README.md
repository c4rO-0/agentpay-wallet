# Wallet documentation

- Completed R11 consumer/state compatibility review. [Dispositions and evidence](records/compatibility-review-2026-11-19.md). Retained historical recovery and published interfaces have explicit exit conditions; no release or deployment.

Choose a path for your task. These guides work with a standalone Wallet checkout;
no private platform repository is required.

| Task | Start here | Supporting reference |
| --- | --- | --- |
| Install and operate Wallet | [Usage](usage.md) | [Secret handling and backups](security/secret-handling.md) |
| Integrate an application | [Public package](reference/public-package.md) | [IPC roles, limits and errors](reference/local-ipc.md) |
| Contribute code | [Developer guide](develope.md) | [Source map](architecture.md), [test guide](../test/README.md), [contributing](../CONTRIBUTING.md) |
| Understand authorization | [Design](design.md) | [Wallet identity](reference/wallet-identity.md), [original-Order recovery](reference/original-order-recovery.md), [Market proofs](reference/market-connection.md) |
| Review security boundaries | [Security policy](security/SECURITY.md) | [Migration](security/policy-migration.md), [time projections](security/order-time-projections.md), [error provenance](security/settlement-error-provenance.md) |
| Maintain a release | [Current progress](../progress.md), [TODO](TODO.md) | [npm release runbook](runbooks/npm-publication.md) |

AI contributors should also read [AGENTS.md](../AGENTS.md).

## Evidence and history

- [2026-11-15 static review](records/mainnet-static-review-2026-11-15.md): original findings, completed corrections and validation limits.
- [Independent package verification](records/npm-package-candidate-2026-11-07.md): initial npm artifact evidence.
- [Public-source review](security/public-source-review-2026-11-06.md): historical publication preparation.
- [Distribution plan](plans/user-wallet-distribution.md): original npm design and implementation sequence, now historical.
- [Progress archive](archive/progress-through-2026-11-13.md) and [task ledger](archive/todo-through-2026-11-15.md): previous checkpoints, including unresolved evidence labels.

## Where documents belong

Current guides live here; interface details are in `reference/`, operational
procedures in `runbooks/`, and trust boundaries in `security/`. Put dated evidence
in `records/`, design proposals in `plans/`, and superseded chronology in `archive/`.
Current sequencing belongs only in `progress.md` and `doc/TODO.md`; historical
records do not override them.
