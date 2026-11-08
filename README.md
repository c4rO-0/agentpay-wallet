# AgentPay Wallet

AgentPay Wallet is a local signing service that lets an AI Agent make payments
within limits approved by the user. It keeps the Session Key on the user's machine
and checks payment requests against a bounded Safe authorization: total budget,
per-payment limit, expiry and eligible services. The Safe Module enforces these
limits on-chain.

Wallet runs separately from the Agent and User Runtime. It exposes specific
payment and Order-support operations, not arbitrary message or transaction signing.

## Install

**Using AgentPay with your AI Agent?** Install AgentPay User. It includes the matching
Wallet package and guides you through setup; no separate Wallet installation is needed:

```sh
npm install --global @c4roa0/agentpay-user
agentpay install --market https://YOUR_MARKET_ORIGIN
```

Replace the Market URL with your platform's address. See the
[AgentPay User installation guide](https://github.com/c4rO-0/agentpay-user#install-with-npm).

### Standalone Wallet

For developers integrating Wallet into another application, install it separately:

```sh
npm install --global @c4roa0/agentpay-wallet
agentpay-wallet --help
```

Both packages require Node.js 22.22.3 or newer and npm. Use a user-owned Node/npm
installation with its executables on PATH. Linux is the verified platform; Wallet
uses Unix sockets, and macOS acceptance is pending. The Wallet package includes
compiled JavaScript, so no Protocol checkout, pnpm or TypeScript build is needed.

## Run a local Wallet

Choose a private data directory outside the program installation. In one terminal:

```bash
agentpay-wallet init "$HOME/.local/share/agentpay-wallet"
agentpay-wallet serve "$HOME/.local/share/agentpay-wallet"
```

`init` creates an encrypted Session Key and asks you to set its password. Back up
the encrypted key file and keep its password safe; the password alone cannot
recover a lost key. `serve` runs in the foreground and starts locked.

In a second terminal:

```bash
agentpay-wallet unlock "$HOME/.local/share/agentpay-wallet"
agentpay-wallet status "$HOME/.local/share/agentpay-wallet"
```

This prepares the local service; it does **not** authorize spending. Payments also
require a Safe owner-approved Policy and a verified local binding. See the
[usage guide](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/usage.md) for
service operation, authorization boundaries and recovery.

## Integrate with an application

Install Wallet as a project dependency to use its public client:

```bash
npm install @c4roa0/agentpay-wallet
```

- [Public interfaces](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/reference/public-package.md): client, trusted local administration and process launcher.
- [IPC guide](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/reference/local-ipc.md): capability roles, request behavior and a status example.

Keep the Session Key and capability tokens private. Locking Wallet stops new local
signatures; it does not revoke on-chain permission or cancel an existing Order.

## Develop and contribute

Clone this repository and follow the
[developer guide](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/develope.md).
The build and tests run independently, without User, a live chain or a database.
The package uses the public `@c4roa0/agentpay-protocol` dependency.

- [Architecture](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/architecture.md) and [design](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/design.md)
- [Contributing](https://github.com/c4rO-0/agentpay-wallet/blob/main/CONTRIBUTING.md) and [documentation catalog](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/README.md)
- [Security reporting](https://github.com/c4rO-0/agentpay-wallet/blob/main/SECURITY.md) and [secret handling](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/security/secret-handling.md)

Wallet is MIT licensed and has not undergone an independent security audit.
Local tests and Anvil rehearsals do not establish production or real-funds readiness.
