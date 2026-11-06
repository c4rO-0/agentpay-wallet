# Wallet design

## One bounded authorization, automatic eligible payments

The Safe owner deliberately authorizes spending limits, expiry and the dynamic
Registry rule. The Session Key then signs eligible payments without a fresh owner
prompt for every Order. Wallet must never offer a generic remote signer to simplify
integration. Provider-specific input/output rules belong to the Provider and Skill,
not Wallet.

## Separate ownership and roles

Wallet owns local key protection and bounded signing. User owns guided setup and
Skill orchestration. Protocol owns canonical bytes and chain interfaces. Settlement
owns public Order operations and commercial decisions; its implementation is outside
this repository. A combined download does not merge these roles or processes.

The admin and Agent capabilities are separate allowlists. Admin means local Wallet
administration, not Safe-owner authority and not an automatic superset of Agent
methods. Code running as the same OS user may access local files; token separation
does not create an OS sandbox. See [IPC](reference/local-ipc.md).

## Local state is not chain authority

The current binding is a validated local snapshot. Local status, nickname, a returned
signature or an accepted request cannot prove a payment happened. Redemption enforces
on-chain Policy and replay constraints. Wallet's live checks vary by operation;
[architecture](architecture.md) states the current limits explicitly.

Lock clears the unlocked signer for future local use. It does not revoke previously
issued signatures. On-chain revocation and Module disablement are owner operations.
The local keystore password protects the Session Key at rest and is not an owner key.

## Preserve identity and recovery

A key can be retained across Policies. Wallet display grouping never merges Order
access scopes. Renewal/migration records the original and replacement bindings so
an interruption does not silently select a new request or authority. An unresolved
record is retained for investigation, not treated as proof of non-payment.

Migration carries remaining allowance and expiry; deliberate renewal can change
limits/expiry after owner approval. Key rotation and more spending authority are
separate decisions. See [identity](reference/wallet-identity.md) and
[original Order reads](reference/original-order-recovery.md).

## Public development boundaries

Use established keystore/Ethereum primitives rather than custom cryptography.
Preserve versioned fields, canonical order and units in readability changes. Source
exports are trusted library entry points; the distributed client contract is still
[planned](plans/user-wallet-distribution.md). The current platform baseline is Linux;
macOS startup integration remains deferred. No private-test outcome authorizes real funds.
