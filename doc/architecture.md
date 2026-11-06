# Wallet architecture

Wallet is a local signing process. User Runtime coordinates purchases and setup;
Wallet keeps the Session Key and accepts only bounded operations over authenticated
local IPC. The Safe owner wallet approves on-chain authority separately. Protocol
owns canonical formats and contracts; Wallet consumes public artifacts.

## Source map

| File | Responsibility | Read alongside |
| --- | --- | --- |
| `src/cli.ts` | Standalone commands and hidden terminal input | `doc/usage.md` |
| `src/ipc.ts` | Unix socket framing, capability authentication and method dispatch | `doc/reference/local-ipc.md` |
| `src/wallet.ts` | Key/binding state, signing orchestration and transition journals | lifecycle and migration tests |
| `src/keystore.ts`, `src/key-import.ts` | Encrypted key lifecycle and bounded backup import | `doc/security/secret-handling.md` |
| `src/files.ts` | Private filesystem checks and atomic file replacement | key import and journal callers |
| `src/commitment.ts` | Structured payment validation, Registry query and EIP-712 construction | `test/lifecycle.test.ts` |
| `src/settlement-request.ts` | Fixed authenticated action envelope and validity checks | `test/settlement-request.test.ts` |
| `src/settlement-http.ts` | Public HTTP payload normalization, response binding and errors | transport tests |
| `src/market-connection.ts` | Fixed-purpose administrative connection proof | `test/market-connection.test.ts` |
| `src/policy-restore.ts` | Read original Policy and verify active binding against local key | restore tests |
| `src/policy-renewal.ts` | Replacement identity/expiry rules | renewal tests |
| `src/policy-migration.ts` | Migration plans, chain inspection and journal validation | migration tests |
| `src/errors.ts` | Public error vocabulary and unexpected-error redaction | HTTP/IPC tests |
| `src/server-process.ts` | Minimal child-process service entry for integration tests | lifecycle tests |
| `src/index.ts` | Current source-library exports | developer guide |

`Phase0Wallet`, `Phase0Policy` and `PHASE0_*` are retained source names. They currently
use the `agentpay.safe-module.v1` binding; “Phase0” is not a separate payment rail.
Do not rename exported identifiers as part of formatting work.

## Payment signing flow

```text
Caller -> IPC role/method check -> Wallet binding/migration checks
       -> structured commitment validation -> Registry RPC check
       -> recheck local binding -> keystore signature -> public audit identity
```

The Caller supplies structured Order facts. Wallet derives the EIP-712 domain and
qualification hash; callers cannot supply arbitrary typed data or raw digests through
IPC. `skillId` identifies the Provider's server-side service, not a downloaded Skill
package. Registry qualification proves the configured service identity/control,
not output quality. New qualified services matching the Policy need no owner signature.

Local commitment checks use saved Policy fields. The Registry query is live, but
Wallet does not independently reread every Vault field, cumulative spend or revocation
before every signature. Module redemption enforces authoritative on-chain constraints;
Settlement acceptance and funding evidence are separate. A signature is not payment
success, and a successful HTTP response alone is not a confirmed refund.

The in-process `#issued` set rejects duplicate local signatures. It is not durable
replay protection and resets on restart. Settlement and the Module must enforce their
own replay boundaries; this repository does not contain their implementation.

## Local lifecycle and persistence

Every opened Wallet starts locked. `status()` reports local state, not current chain
readiness. An unlocked Wallet with a binding may sign only after operation-specific
checks. An absent binding cannot sign payments. An administrative transition blocks
conflicting operations; process restart reloads its journal instead of inventing a
new identity.

| Local entry | Meaning |
| --- | --- |
| `session.keystore.json` | Encrypted Session Key; password required after restart |
| `agent.token`, `admin.token` | Separate local application capabilities |
| `wallet.sock` | Local Unix socket; no Wallet HTTP/TCP listener |
| `policy.json` | Current public Policy binding, stored privately |
| `policy-migration.json`, `policy-renewal.json` | Pending/completed transition journals |
| `policy-migrations/`, `policy-renewals/` | Original transition/scoping records |
| `audit.jsonl` | Operation/result/public identifiers, never replayable signatures |
| `tombstone.json` | Public identity retained after deliberate local key deletion |

Private directories/files are expected to be `0700`/`0600`. Same-OS-user code is not
strongly isolated from these files. `JsonKeystoreBackend` is a trusted in-process
primitive; its typed-data signer is not a remote capability. Importing internal
classes does not sandbox hostile code with filesystem access.

## Binding, restoring and changing authority

- **Initial bind:** the admin method validates the local structure and key address,
  refuses replacement, then saves the binding. It does not itself prove every
  on-chain term. The guided owner flow must verify chain operations before binding;
  Module enforcement still applies when a payment is redeemed.
- **Restore:** requires an unlocked original key, reads Policy/Safe/contract facts
  through the configured RPC at one block and verifies active terms. A conflicting
  existing binding is retained. It sends no owner transaction.
- **Renew:** verifies the replacement, preserves the required identity, requires old
  revocation where necessary, saves a pending journal, archives the original scope,
  switches the binding and marks completion. A retry resumes the same transition.
- **Migration:** previews exact chain-dependent terms, persists the approved plan
  before owner actions, and verifies it again before switching. Pending migration
  blocks signing and unlock. Cancellation is permitted only before irreversible
  owner actions. See [migration boundaries](security/policy-migration.md).

The busy flag coordinates operations inside one Wallet instance. Journals coordinate
restart recovery; they are not a claim of general multi-process locking. Run one
Wallet service per data directory. Atomic rename and explicit directory sync at
journal call sites support recovery, not a guarantee against every filesystem failure.

## Existing-Order requests

Authenticated actions use a separate fixed EIP-712 request envelope. The HTTP
adapter normalizes and hashes only the action's supported fields, signs a short-lived
request and validates returned identity/time metadata. It never forwards generic
signing instructions. Original-Policy reads verify the original delegate, keep the
current binding unchanged and cannot create replacement purchases.

RPC honesty/finality, code authenticity, host security and dependency integrity
remain assumptions. Local tests and private Anvil evidence do not certify live-network
readiness. See [design rationale](design.md), [IPC](reference/local-ipc.md) and
[security policy](security/SECURITY.md).
