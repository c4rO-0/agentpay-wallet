# Wallet usage

Build with the commands in the [README](../README.md). Wallet can run independently;
User supplies the guided AgentPay installation and owner-approval experience.

## Standalone service

Use a private data directory outside the checkout. In one terminal:

```bash
node dist/src/cli.js init "$HOME/.local/share/agentpay-wallet"
node dist/src/cli.js serve "$HOME/.local/share/agentpay-wallet"
```

Initialization asks for an unlock secret. Keep the encrypted Session Key backup
and password safe. The service starts locked and stays in the foreground; in a
second terminal, use the status/unlock commands below. Initialization does not grant
spending permission. Do not manually construct a Policy binding to bypass independent
verification. Use User's owner-approval guide or the documented bounded integration.

## Guided AgentPay use

The current User installer requires its matching Wallet 0.2.0 source revision;
it does not yet accept this 0.3.0 npm candidate. For that released pair, clone Wallet
into `wallet` beside `user`. Run User's installation
command to prepare both; see
[AgentPay User installation](https://github.com/c4rO-0/agentpay-user/blob/main/doc/runbooks/user-onboarding.md).
Keep User data separate from both source folders. User manages background services,
owner approval, renewal, backup restoration and Market connections. Wallet remains
the signing boundary. User installation from npm is planned, not yet available.

External Safe owner signing through User has private single-owner Anvil evidence.
That does not establish live-network, multisig or every headless environment's
acceptance. Test signers are restricted tools, never a substitute for owner approval.

## Identity and recovery

Use `./run wallet restore` from User for existing-key/Policy restoration. Wallet
validates encrypted backups, requires actual key possession and reads original
Policy facts independently. Recovery never replenishes budget or extends expiry.
An existing different identity is preserved rather than overwritten. Keep the
full local data directory to retain request recovery records; a Policy ID alone
cannot recover a lost Session Key.

Use User's `./run policy renew` for deliberate replacement and
`./run policy revoke` for owner-approved revocation. Wallet verifies migration
before switching bindings and retains original scopes. Do not delete binding
files or reinitialize a key to solve an upgrade mismatch.

## Existing Orders

Cancellation, result retrieval and support use narrow authenticated IPC and the
original Order/Policy scope. Cancellation requested is not refund confirmed.
Provider acceptance and original deadlines determine available actions; refunded
funds do not replenish cumulative Policy spend. Consult current [progress](../progress.md)
for evidence and [Order recovery](reference/original-order-recovery.md) for boundaries.

## Settlement request errors

Wallet preserves reviewed Settlement errors as stable Agent-facing codes.
Unknown valid Settlement codes use `SETTLEMENT_REQUEST_REJECTED` and carry
the original in optional `settlementCode` through Wallet IPC. Settlement's
message is retained. Error metadata never authorizes a payment or replaces
the on-chain Policy checks.

## Local CLI reference

After building, run from the Wallet repository. `DATA` denotes your private Wallet data directory, not the User Runtime directory.

```text
node dist/src/cli.js init DATA
node dist/src/cli.js serve DATA
node dist/src/cli.js address DATA
node dist/src/cli.js status DATA
node dist/src/cli.js unlock DATA
node dist/src/cli.js lock DATA
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
