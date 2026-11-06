# Wallet identity and Policy scopes

The execution address is derived from the Session Key. It is not a device ID.
Copying that key to another machine does not create a new execution identity.
Market groups a Wallet by network + Module + Safe + execution address, within its
account. A nickname is a display label; it grants no authority and is not signed
payment identity.

One key can participate in several independently verified Policies. Each Policy ID
remains an Order-access boundary. Renewal creates new spending authority; it does
not rewrite old Order scopes or make all Policies interchangeable. Historical reads
must verify the original Policy's delegate rather than trust a client-provided ID.
See [original Order reads](original-order-recovery.md).

## Spending and existing Orders

Expiry ends new spending. Disabling the Module prevents its payment execution.
Revocation ends new spending under that Policy. Neither local lock nor a Market
disconnect revokes outstanding signatures on-chain.

Wallet's request builder permits bounded existing-Order support actions after
spending expiry; it is not the authority deciding whether an Order may be cancelled,
confirmed or disputed. Settlement checks the signed Policy, Order ownership and
applicable action/state/deadline rules. Do not infer permission to act from a
successful signature or from the display group. Historical `order.read` independently
checks the original delegate and does not require the old Policy to remain spendable.

Initial local binding, recovery, renewal and contract migration are different flows.
Recovery verifies an active original authorization before binding it. Read-only old
Order access does not restore spending. The local `policy.json` records one current
binding; journals retain prior scopes. See [architecture](../architecture.md).
