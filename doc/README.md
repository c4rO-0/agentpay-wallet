# Wallet documentation

## Choose a reading path

| Reader | Start here | Then read |
| --- | --- | --- |
| User or local operator | [Repository introduction](../README.md), [usage](usage.md) | [Secret handling](security/secret-handling.md) |
| New contributor | [Developer guide](develope.md) | [Architecture/source map](architecture.md), [design rationale](design.md), [contributing](../CONTRIBUTING.md) |
| Integrator | [Local IPC](reference/local-ipc.md) | [Identity](reference/wallet-identity.md), [Order recovery](reference/original-order-recovery.md), [Market proof](reference/market-connection.md) |
| Security reviewer | [Security policy](security/SECURITY.md) | [Migration](security/policy-migration.md), [time projections](security/order-time-projections.md), [error provenance](security/settlement-error-provenance.md) |
| Maintainer | [Progress](../progress.md), [TODO](TODO.md) | [Distribution plan](plans/user-wallet-distribution.md), [public-source review](security/public-source-review-2026-11-06.md) |
| AI contributor | [AGENTS](../AGENTS.md) | Current progress, then the affected interface and tests |

## Directory responsibilities

- Top-level guides describe current use, structure and development.
- `reference/` describes current interfaces and identity semantics.
- `security/` documents trust boundaries, reporting and scoped review evidence.
- `plans/` contains future work, explicitly distinguished from implemented features.
- [Test directory guide](../test/README.md) maps behavioral coverage and fixture limits.
- Root `progress.md` describes evidence; `doc/TODO.md` lists outstanding work.

Private integration scripts, deployment records and internal chronology do not ship
with Wallet. Public API descriptions do not include the Settlement implementation.
Keep installation instructions independent of unavailable parent repositories.
