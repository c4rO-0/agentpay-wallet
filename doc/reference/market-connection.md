# Local administrative Market connection proof

The administrative IPC methods `marketConnectionScope` and `signMarketConnection`
read the currently bound public Policy identity and sign a fixed connection proof.
They are absent from the Agent capability allowlist. User's `./run market connect`
uses them after a deliberate account/nickname confirmation. The Wallet must be
unlocked and bound; pending Policy migration remains a blocker.

The action is `market.connect` in the existing AgentPay Settlement Request EIP-712
envelope. Domain chain/Module, message Safe/Policy and payload hash bind the exact
authority. Payload fields, in fixed normalized order, are `marketOrigin`,
`accountId`, `challengeId`, `nonce`, `label`, `expiresAtMs`. The origin must be HTTPS
or loopback HTTP, IDs/nonces are fixed random hex, and nickname is trimmed/bounded
at 64 characters without control characters. Unexpected fields are rejected.

The proof lasts at most 60 seconds, capped by challenge expiry. Spending expiry
does not by itself prohibit this short connection proof. Market
challenges last ten minutes; the upper-bound sanity check tolerates one minute of
host-clock skew and millisecond rounding. Backend challenge expiry and signed
request expiry remain authoritative. No Order deadline changes.

This adds no generic signing API, owner authority, payment, receipt-confirmation
or Policy-management permission. Public Wallet action HTTP normalization does not
turn `market.connect` into a payment route: verification is a Market-authenticated
backend operation. Market separately consumes its current account challenge.

Each proof binds one immutable `(network, Module, Safe, policyId)` scope. Market
may group individually verified Policies under the Wallet execution identity; that
display grouping does not merge their authority.
A copied key/Policy on another machine remains one authority; a nickname does not
create terminal identity. Market website requests independently verify the current
delegate and applicable access rules through its authenticated public API. Already linked history remains available
past spending expiry, under unchanged case deadlines. New proofs require the local key and the defined proof validation, not new
spending permission. This does not prove Safe ownership.

Local admin/Agent tokens enforce an IPC capability boundary, not filesystem
isolation: arbitrary code running as the same OS user may read admin files. Keep
untrusted Skill execution outside that trust boundary. Neither token nor key goes
to Market; the User process sends only the bounded signed proof and keeps the login
session in memory until logout. Wallet audit records only request ID/action/result.

Targeted fixed-schema/hash/expiry tests and real Unix IPC Agent-denial tests are in
`test/market-connection.test.ts`. Actual owner/participant use is separate acceptance.
