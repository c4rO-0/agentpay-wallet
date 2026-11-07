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

For the migration to npm Protocol dependencies, update AgentPay User and Wallet
together. An older User checkout still expects the former archive dependency and
will reject this Wallet revision during repair.

- For guided installation, authorization and service management, use
  [AgentPay User](https://github.com/c4rO-0/agentpay-user). Current source installation
  requires sibling `user/` and `wallet/` folders. The combined ZIP and compatibility
  checks are [planned](doc/plans/user-wallet-distribution.md), not available yet.
- For standalone local CLI and integration, read [usage](doc/usage.md) and
  [development](doc/develope.md). Keep runtime data outside the source checkout.

Wallet starts locked. Unlocking permits bounded operations; it does not create
spending permission. Local lock, process shutdown and on-chain revocation are
separate operations. Never share a Session Key, keystore password or capability token.

## Documentation

- [Architecture](doc/architecture.md), [design](doc/design.md) and [contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md) and [secret handling](doc/security/secret-handling.md)
- [Documentation catalog](doc/README.md), [progress](progress.md), [TODO](doc/TODO.md)
- [MIT license](LICENSE)

The current source is unaudited. Recorded private Anvil flows, including external
owner signing through User, are scoped evidence, not approval for real funds.
Private platform integration scripts and records are not distributed here.
Protocol is installed from npm as `@c4roa0/agentpay-protocol`, pinned to version
`0.14.3`; the lockfile records package integrity. No local Protocol checkout or
vendored archive is needed.
