# Wallet usage

Wallet can run independently; User supplies guided AgentPay setup and owner approval.
For a source checkout, follow the build
instructions in the [developer guide](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/develope.md).

## Standalone service

After installing the package as a dependency, use its command from your project's
`node_modules/.bin` (or `agentpay-wallet` if installed on PATH):

```bash
./node_modules/.bin/agentpay-wallet init "$HOME/.local/share/agentpay-wallet"
./node_modules/.bin/agentpay-wallet serve "$HOME/.local/share/agentpay-wallet"
```

Source contributors can use `node dist/src/cli.js` after `pnpm build` instead.
In either case, keep private data outside the program installation.

Initialization asks for an unlock secret. Keep the encrypted Session Key backup
and password safe. The service starts locked and stays in the foreground; in a
second terminal, use the status/unlock commands below. Initialization does not grant
spending permission. Do not manually construct a Policy binding to bypass independent
verification. Use User's owner-approval guide or the documented bounded integration.

## Data and service lifecycle

The directory you pass to each command contains `session.keystore.json`,
capability tokens, `policy.json` once bound, and local recovery journals. Keep this
directory private and back it up securely. Store its unlock password separately.
Do not copy it into the package folder or publish it with your application.

`serve` stays in the foreground. Ctrl+C stops that process; starting it again loads
the same data and starts locked. npm installation does not configure automatic
startup. Only one Wallet process should use a given data directory.

Use `lock` to stop new local signatures without stopping the process. This does
not revoke signed requests or on-chain authorization. `status` reports saved local
state, not a fresh verification of balance, expiry or revocation on the chain.

## Guided AgentPay use

Install AgentPay User for guided setup; npm installs its matching Wallet dependency:

```sh
npm install --global @c4roa0/agentpay-user
agentpay install --market https://YOUR_MARKET_ORIGIN
```

Use your platform's Market address. No separate Wallet checkout is required.
See [AgentPay User installation](https://github.com/c4rO-0/agentpay-user#install-with-npm).
User manages background services, owner approval, renewal, backup restoration and
Market connections. Wallet remains the signing boundary. Keep User data outside
program installation folders. Use the User-managed Wallet version instead of
upgrading that dependency independently.

External Safe owner signing through User has private single-owner Anvil evidence.
That does not establish live-network, multisig or every headless environment's
acceptance. Test signers are restricted tools, never a substitute for owner approval.

## Identity and recovery

Use `agentpay wallet restore` from an npm User installation for existing-key/Policy restoration. Wallet
validates encrypted backups, requires actual key possession and reads original
Policy facts independently. Recovery never replenishes budget or extends expiry.
An existing different identity is preserved rather than overwritten. Keep the
full local data directory to retain request recovery records; a Policy ID alone
cannot recover a lost Session Key.

Use User's `agentpay policy renew` for deliberate replacement and
`agentpay policy revoke` for owner-approved revocation. Wallet verifies migration
before switching bindings and retains original scopes. Do not delete binding
files or reinitialize a key to solve an upgrade mismatch.

## Existing Orders

Cancellation, result retrieval and support use narrow authenticated IPC and the
original Order/Policy scope. Cancellation requested is not refund confirmed.
Provider acceptance and original deadlines determine available actions; refunded
funds do not replenish cumulative Policy spend. Consult current [progress](https://github.com/c4rO-0/agentpay-wallet/blob/main/progress.md)
for evidence and [Order recovery](https://github.com/c4rO-0/agentpay-wallet/blob/main/doc/reference/original-order-recovery.md) for boundaries.

## Settlement request errors

Wallet preserves reviewed Settlement errors as stable Agent-facing codes.
Unknown valid Settlement codes use `SETTLEMENT_REQUEST_REJECTED` and carry
the original in optional `settlementCode` through Wallet IPC. Settlement's
message is retained. Error metadata never authorizes a payment or replaces
the on-chain Policy checks.

## Local CLI reference

For a global npm installation, use the commands below. For a project dependency,
replace `agentpay-wallet` with `./node_modules/.bin/agentpay-wallet`. Source
contributors can use `node dist/src/cli.js` after building. `DATA` denotes the
private Wallet directory, not the User Runtime directory.

```text
agentpay-wallet init DATA
agentpay-wallet serve DATA
agentpay-wallet address DATA
agentpay-wallet status DATA
agentpay-wallet unlock DATA
agentpay-wallet lock DATA
```

Initialization/unlock prompt for the secret in the terminal. Startup stays locked. Prefer the User guide for chain authorization and initial binding; existing Policy replacement uses its explicit migration procedure. Local lock is not on-chain revocation.


## Scoped Order support — source 2026-10-25

User repository commands expose existing-Order status, original-result retrieval
and case access through Wallet's bounded local IPC. The Wallet creates a short,
one-Order case code after checking the configured Safe/delegate. It is not a
Session Key or spending permission. Ordinary Policy expiry permits the defined
short existing-Order support requests; new spending remains prohibited. Revoked
or inactive authorization is not silently renewed. Keep the Wallet unlocked for
these requests. No website needs its password or private key. Consult current progress for deployment and participant evidence; source checks
alone do not prove a particular installation is ready.

## Administrative restrictions on new Orders

Settlement restrictions stop new Orders for a Provider (all its services), a
server-side service skillId or a Buyer Safe. Already-created Orders, including
prepared but unpaid Orders, keep payment, delivery, refund, dispute and recovery
under their original rules. Matching retries recover the same Order. Provider
credentials, Registry qualification and Safe spending Policy are not revoked by
this control. Public Market status uses Suspended and excludes private operation
reasons; after unblock, normal readiness must still pass. Unknown status requires
fresh checks. Source verification is complete; current progress distinguishes
deployment and participant acceptance from source tests.

### Chain RPC unavailable

`CHAIN_RPC_UNAVAILABLE` means Wallet could not complete a read through its configured
blockchain RPC. Check the network and RPC service. If the address uses an SSH tunnel,
keep that tunnel running. Retry the original request after connectivity returns;
do not create a replacement purchase or Policy to fix a connection failure.
