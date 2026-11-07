# Public Wallet package

The 0.3.0 candidate is not published. It packages compiled JavaScript and TypeScript
declarations; installation does not create keys, start services or grant permission.
AgentPay User integration is a separate next step.

## Integration entries

| Entry | Purpose |
| --- | --- |
| `@c4roa0/agentpay-wallet` or `/client` | `callWallet`, `readCapability`, `WalletError` for the capability-scoped IPC service |
| `@c4roa0/agentpay-wallet/local` | `Phase0Wallet`, `initializeCapabilities`, `WalletError`, `Phase0Policy` type for trusted local administration |
| `@c4roa0/agentpay-wallet/cli` | Resolve and launch the compiled command using Node |
| `@c4roa0/agentpay-wallet/package.json` | Read installed version and dependency metadata |

The installed command is `agentpay-wallet`; use `--help` or `--version` to inspect it.
For a programmatic launcher:

```js
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = fileURLToPath(import.meta.resolve('@c4roa0/agentpay-wallet/cli'));
const child = spawn(process.execPath, [cli, 'serve', dataDirectory]);
```

Use the client entry for Agent/Runtime requests. The server still checks each
capability and method. The local entry is for software already trusted with the
user's private data directory; it is not an Agent or Skill API. Package exports are
an integration contract, not a sandbox against code with filesystem access.
There is no generic signing method. See [IPC reference](local-ipc.md).

Do not import `dist/src`, `lib` internals, keystore helpers or private file helpers.
Keep private data outside the package directory. Upgrading files does not upgrade
an already running process; User's planned integration must restart the service and
check compatibility without replacing keys, Policies or Order history.

## Candidate verification

From a source checkout, install dependencies and run `pnpm test:package`.
The test installs the packed artifact outside the checkout and exercises the CLI,
IPC permission checks, unlock and process restart. It uses no live network chain
or payment. `pnpm build:package` builds the artifact; `npm pack --ignore-scripts`
can then create a local tarball for review. npm publication remains disabled.
