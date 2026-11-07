# AgentPay Wallet

Wallet is a local signing service for bounded AgentPay payments. It protects a
Session Key and validates AgentPay requests; a Safe and its Spending Module enforce
the on-chain authorization. Eligible purchases do not require a new owner signature.
Wallet is separate from User Runtime and never exposes generic message or transaction
signing to an Agent. It is not a general-purpose cryptocurrency wallet.

## Build and verify independently

Use Node.js 22.22.3 or newer and pnpm 10. Run from this repository:

Corepack is required by the commands below. If it is absent, install it with
`npm install --global corepack` using your Node installation.

```bash
corepack enable
corepack prepare pnpm@10.0.0 --activate
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

`pnpm test` builds and exercises local Wallet behavior with disposable keys and
controlled RPC/HTTP fixtures. It needs no live chain, database or sibling repository.
Tests use local sockets/ports; run them in an environment that permits these.
They do not prove real-network compatibility or production readiness.

## Use Wallet

Wallet 0.3.0 is an **unpublished npm package candidate**. It provides a compiled
CLI and public client entries; npm installation needs no TypeScript build. User's
migration to this package is the next stage. Do not replace Wallet in an existing
User 0.2.0 source pair with this candidate: that installer's pair check rejects it.

- For standalone integration, read [public package interfaces](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/reference/public-package.md)
  and [local CLI usage](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/usage.md).
- For guided installation and owner approval, use a matching released
  [AgentPay User](https://github.com/c4rO-0/agentpay-user) and Wallet pair until User's
  npm integration is available. Separate sibling source folders are still required
  by that existing installation flow.

To verify the candidate from source, run `pnpm test:package` after installing
dependencies. It builds and installs a tarball in a temporary project, then tests
the installed CLI and real Wallet process. It does not publish anything.

Wallet starts locked. Unlocking permits bounded operations; it does not create
spending permission. Local lock, process shutdown and on-chain revocation are
separate operations. Never share a Session Key, keystore password or capability token.

## Documentation

- [Architecture](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/architecture.md), [design](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/design.md) and [contributing](https://github.com/c4rO-0/agentpay-wallet/blob/main/CONTRIBUTING.md)
- [Security policy](https://github.com/c4rO-0/agentpay-wallet/blob/main/SECURITY.md) and [secret handling](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/security/secret-handling.md)
- [Documentation catalog](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/README.md), [progress](https://github.com/c4rO-0/agentpay-wallet/blob/main/progress.md), [TODO](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/TODO.md)
- [MIT license](https://github.com/c4rO-0/agentpay-wallet/blob/main/LICENSE)

The current source is unaudited. Recorded private Anvil flows, including external
owner signing through User, are scoped evidence, not approval for real funds.
Private platform integration scripts and records are not distributed here.
Protocol is installed from npm as `@c4roa0/agentpay-protocol`, pinned to version
`0.14.3`; the lockfile records package integrity. No local Protocol checkout or
vendored archive is needed.
