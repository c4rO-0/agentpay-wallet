# Wallet documentation

## Choose a reading path

| Reader | Start here | Then read |
| --- | --- | --- |
| User or local operator | [Repository introduction](https://github.com/c4rO-0/agentpay-wallet/blob/main/README.md), [usage](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/usage.md) | [Secret handling](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/security/secret-handling.md) |
| New contributor | [Developer guide](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/develope.md) | [Architecture/source map](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/architecture.md), [design rationale](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/design.md), [contributing](https://github.com/c4rO-0/agentpay-wallet/blob/main/CONTRIBUTING.md) |
| Integrator | [Public package](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/reference/public-package.md), [Local IPC](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/reference/local-ipc.md) | [Identity](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/reference/wallet-identity.md), [Order recovery](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/reference/original-order-recovery.md), [Market proof](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/reference/market-connection.md) |
| Security reviewer | [Security policy](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/security/SECURITY.md) | [Migration](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/security/policy-migration.md), [time projections](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/security/order-time-projections.md), [error provenance](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/security/settlement-error-provenance.md) |
| Maintainer | [Progress](https://github.com/c4rO-0/agentpay-wallet/blob/main/progress.md), [TODO](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/TODO.md) | [Distribution plan](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/plans/user-wallet-distribution.md), [public-source review](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/security/public-source-review-2026-11-06.md) |
| AI contributor | [AGENTS](https://github.com/c4rO-0/agentpay-wallet/blob/main/AGENTS.md) | Current progress, then the affected interface and tests |

## Directory responsibilities

- Top-level guides describe current use, structure and development.
- `reference/` describes current interfaces and identity semantics.
- `security/` documents trust boundaries, reporting and scoped review evidence.
- `plans/` contains future work, explicitly distinguished from implemented features.
- [Test directory guide](https://github.com/c4rO-0/agentpay-wallet/blob/main/test/README.md) maps behavioral coverage and fixture limits.
- Root `progress.md` describes evidence; `doc/TODO.md` lists outstanding work.

## Maintainer references

- [Package verification](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/records/npm-package-candidate-2026-11-07.md): independent installation and behavior evidence.
- [npm publication](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/runbooks/npm-publication.md): first release and trusted publishing.

Build and integration instructions require no private platform repository.
