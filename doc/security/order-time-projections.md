# Order timestamp response boundary

Wallet requests participant Order v2 via Accept and normalizes both v2 and
explicit legacy v1 ingress to integer millisecond DTOs. It rejects ambiguous
ISO, unknown versions/fields, wrong role, invalid clocks and numeric strings
where milliseconds are required. Read binds orderId; prepare binds skillId,
profileHash and requestHash to the normalized signed action payload.

Accept changes disclosure only. Signed action, payload hash, nonce and the
validBefore seconds remain unchanged. No owner confirmation or new capability
is introduced; Session Key custody, independent Policy/Registry/chain checks
and limits remain in Wallet. No generic signing or administration action is added.
Malformed responses fail as SETTLEMENT_RESPONSE_INVALID rather than purchase
permission. The adapter does not prove the correctness of upstream historical storage.

Transport tests use controlled loopback HTTP and protocol fixtures. Source checks
do not prove upstream storage correctness or a deployed network's finality.

## Notice / confirmation and Service Authorization extensions

The reviewed transport now verifies Service Authorization orderId/requestHash,
confirmation orderId and notice payload/order binding. Time schemas are closed;
invalid piggyback notices produce SETTLEMENT_RESPONSE_INVALID. Owner policy,
Agent/admin IPC, nonce/signature and generic signing denial are unchanged. The
real service-ready IPC test covers locked access, bounded signed action, malformed
expiry and absence of signing material. Legacy database provenance is not proven
by a correct typed response; deployment requires separate storage mapping.
