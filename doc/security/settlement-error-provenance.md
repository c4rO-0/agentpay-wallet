# Settlement error provenance across Wallet IPC

The User approved a small error-transport change after the private rolling
upgrade exposed a `POLICY_PROFILE_MISMATCH` that Wallet flattened to
`SETTLEMENT_REQUEST_REJECTED`. Settlement's message was already retained.

The Wallet maps only reviewed Settlement codes to stable Wallet/Agent error
codes. Current reviewed codes are `POLICY_PROFILE_MISMATCH` and
`NEW_ORDERS_PAUSED`. Other valid, bounded codes use the existing
`SETTLEMENT_REQUEST_REJECTED` fallback and are carried separately as
`settlementCode`. Missing or malformed codes do not receive provenance.
The same optional field survives Wallet IPC and User Runtime error output.

## Trust boundary

- An HTTP response code is a claim from the configured Settlement endpoint,
  not cryptographic evidence. Only allowlisted codes become Wallet control
  codes; arbitrary upstream strings cannot impersonate Wallet-local errors.
  Lookup checks own properties: inherited names such as `constructor` and
  `toString` use the default, and public JSON retains a string `code`.
- Unknown codes are constrained to 64 printable ASCII letters, digits, dots,
  hyphens or underscores before being copied as `settlementCode`. They are diagnostic
  data, not a trigger for signing, retry, Policy migration or payment.
- The existing fixed signed action, payload hash, nonce, short validity,
  Agent/admin capability split, Session Key custody and on-chain limits are
  unchanged. Neither `settlementCode` nor message enters a signature.
- Existing raw Settlement error messages were already returned to the caller;
  this loop adds no new private request, output, credential or key exposure.

Focused loopback tests cover reviewed, unknown and malformed HTTP errors,
and a real Wallet Unix-socket test covers `POLICY_PROFILE_MISMATCH` through
the Agent capability. Live private-process rollout remains a separate check.

The 2026-09-28 closeout correction includes inherited-property HTTP fixtures
and JSON serialization assertions. Strict TS and 8 focused HTTP/IPC/migration
tests passed; this correction has not been deployed to the private process.
