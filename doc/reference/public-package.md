# Public Wallet package

The package contains compiled JavaScript and TypeScript
declarations; installation does not create keys, start services or grant permission.
AgentPay User installs its exact reviewed Wallet dependency automatically. Applications
that manage Wallet themselves should pin and verify their own supported version.

## Integration entries

| Entry | Purpose |
| --- | --- |
| `@c4roa0/agentpay-wallet` or `/client` | `callWallet`, `readCapability`, `WalletError` for the capability-scoped IPC service |
| `@c4roa0/agentpay-wallet/local` | `Phase0Wallet`, `initializeCapabilities`, `WalletError`, `Phase0Policy` type for trusted local administration |
| `@c4roa0/agentpay-wallet/cli` | Resolve and launch the compiled command using Node |
| `@c4roa0/agentpay-wallet/package.json` | Read installed version and dependency metadata |

The installed command is `agentpay-wallet`; use `--help` or `--version` to inspect it.
For a programmatic launcher, install the dependency in your project and save this
as an `.mjs` file. Set `WALLET_DATA_DIR` to the initialized Wallet directory. The
service starts locked and runs until stopped:

```js
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const dataDirectory = process.env.WALLET_DATA_DIR;
if (!dataDirectory) throw new Error('Set WALLET_DATA_DIR to an initialized Wallet directory.');
const cli = fileURLToPath(import.meta.resolve('@c4roa0/agentpay-wallet/cli'));
const child = spawn(process.execPath, [cli, 'serve', dataDirectory], { stdio: 'inherit' });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
```

Use the client entry for Agent/Runtime requests. The server still checks each
capability and method. The local entry is for software already trusted with the
user's private data directory; it is not an Agent or Skill API. Package exports are
an integration contract, not a sandbox against code with filesystem access.
There is no generic signing method. See [IPC reference](local-ipc.md).

Do not import `dist/src`, `lib` internals, keystore helpers or private file helpers.
Keep private data outside the package directory. Upgrading files does not upgrade
an already running process. User checks installed/running compatibility and provides
its repair flow to rebuild or restart as needed, preserving keys, Policies and Order
history. A standalone integration must manage that lifecycle itself.

## Package verification

From a source checkout, install dependencies and run `pnpm test:package`.
The test installs the packed artifact outside the checkout and exercises the CLI,
IPC permission checks, unlock and process restart. It uses no live network chain
or payment. `npm pack` rebuilds compiled files through its prepack step before creating a
local tarball for review. Do not bypass that step with `--ignore-scripts`. Publication requires the separate maintainer release procedure.
