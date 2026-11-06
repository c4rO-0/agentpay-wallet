# Original-Policy Order reads

This read path helps a caller recover a previously created Order without replacing
the current Policy, preparing another Order or submitting another payment.

## Request boundary

Agent IPC `readSettlementOrder` accepts `settlementUrl`, exactly one selector
(`orderId` or `orderRequestId`) and optional `recoveryScope`. The scope contains
network, Module, Safe and original Policy ID. A missing scope must not be guessed
from a new binding merely because the original record is incomplete.

Without an explicit historical scope, Wallet signs under its current binding. With
one, `signHistoricalOrderRead` requires the same network/Module/Safe, queries the
original on-chain Policy and checks its delegate against the local execution key.
It rejects a future activation and permits only `order.read`. It does not require
the original authorization to remain spendable and does not switch `policy.json`.
An unlocked key is still required to produce the signature.

The action payload hash binds the chosen selector. The HTTP adapter validates the
returned Order/request identity and protocol projection. A not-found response is
limited to the authenticated lookup scope; it is not proof that no funds moved.
Settlement's public API remains responsible for protected reads and action-specific
rules. This path cannot sign a payment or other action under an arbitrary old Policy.

## Caller responsibilities

Persist the original request and authorization scope before preparation. Validate
returned identity before attaching a recovered Order. Keep incomplete records for
review rather than inventing a replacement request. User Runtime manages its own
history and retry UI; Wallet does not own that store.

If the Module/network/Safe differs, this bounded historical path refuses the scope.
It is not universal migration between arbitrary deployments. Request/Order IDs
alone are insufficient to recover an absent key or prove authorization.

## Verification

`test/historical-order-read.test.ts` covers original scope, delegate and read-only
signing behavior using controlled RPC fixtures. Request selection and returned
identity checks also live in `test/settlement-request.test.ts`. These tests do not
claim that a particular live Order was recovered or a deployed server is compatible.
