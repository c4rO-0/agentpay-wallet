# Local Wallet IPC

This describes the current source interface for trusted local integrators. It is
not a new wire version or a promise that internal module paths are a released SDK.
The stable client/distribution contract is tracked separately.

## Transport and capabilities

Wallet serves a Unix socket at `DATA/wallet.sock`. DATA is the Wallet data directory,
not the User directory or a source checkout. `initializeCapabilities` creates distinct
Agent/admin token files. The client supplies one token on each request; the server
selects the matching role and checks its method allowlist before dispatch.

Current framing is one newline-terminated JSON request per connection, followed by
one response and connection close. Requests are bounded to 64 KiB. The exported
`callWallet` constructs requests and maps error responses to `WalletError`.

| Role | Operations |
| --- | --- |
| Both | `status`, `getAddress` |
| Agent | Structured commitment signing; supported Order, notice, delivery and dispute requests |
| Admin | Bind/unlock/lock/destroy; restore/renew/migrate Policy; Market connection scope/proof |

The complete allowlists are `AGENT_METHODS` and `ADMIN_METHODS` in `src/ipc.ts`.
Admin is not a superset of Agent. The Agent cannot unlock, change binding or connect
a Wallet to a Market account. Neither role has a generic signing or transaction API.

## Read local status

After building and starting an initialized service, a trusted local program can use:

```js
import { join } from 'node:path';
import { callWallet, readCapability } from './dist/src/index.js';

const dataDir = process.env.WALLET_DATA_DIR; // Explicit private Wallet directory.
if (!dataDir) throw new Error('Set WALLET_DATA_DIR first.');
const token = await readCapability(dataDir, 'agent');
const status = await callWallet(join(dataDir, 'wallet.sock'), token, 'status');
console.log({ locked: status.locked, bound: status.bound });
```

Save the example at the repository root or adjust the import to your installed
entry. This performs no payment or chain lookup. Do not print the token. Direct
library imports run with the caller's OS permissions; capability checks protect the
IPC boundary, not hostile code already able to read the same user's files.

## Errors and status

Responses contain `ok` and either `result` or an error code/message. Unknown internal
exceptions use `INTERNAL_ERROR`; reviewed upstream failures may include
`settlementCode`. See [error provenance](../security/settlement-error-provenance.md).
Never log passwords, signed payloads or capability tokens to diagnose a failure.

`status` is a local snapshot. Bound does not mean unexpired, unrevoked, funded or
accepted by a current deployment. A timeout does not prove a remote operation did
not happen. Retain original Order/request identity and use read/recovery operations
before deciding what to retry. Current transport behavior and its limits should
be tested when changing IPC; do not add generic retries around financial operations.
