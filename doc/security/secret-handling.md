# Secret Handling

## Secrets

Wallet secrets include Session Key material, encrypted keystores, unlock
secrets, Agent and administrator capability tokens, and replayable signed
commitments. Private RPC URLs, Safe owner keys, customer requests, and Skill
outputs also remain outside this repository and Wallet audit records.

## Rules

- Never accept an unlock secret from a command-line argument, environment
  variable, config file, log field, or audit field.
- Never commit a keystore, capability token, private key, signed commitment, or
  real runtime data directory.
- Keep the runtime directory at `0700` and keystore, token, policy, tombstone,
  audit, and socket entries at `0600`.
- Return stable error codes without echoing request bodies, secrets, keystore
  content, or internal exception stacks.
- Keep raw signatures in the immediate response only; audit the public
  commitment identity instead of the replayable payload or signature.
- Treat local lock as prevention of new Wallet signatures, not as revocation of
  outstanding commitments. Revoke the Safe policy on-chain for the final stop.

## Development And Tests

Tests may use explicit non-secret marker passwords and disposable temporary
directories. They must remove generated keystores and tokens at completion and
scan process output, API errors, and audit records for marker leakage. Test
fixtures must never be reused as canary or production credentials.
