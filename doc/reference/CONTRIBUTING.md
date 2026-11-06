# Contributing

AgentPay Wallet is a security-sensitive user-side signing boundary. Discuss
changes to its workflow, architecture, policy model, key lifecycle, public API,
or signer backend with the maintainers before implementation.

## Development

Use Node.js 22.22.3 or newer and pnpm 10; follow the independent build/test
steps in the repository README. For example:

```bash
corepack pnpm@10.0.0 install --frozen-lockfile
corepack pnpm@10.0.0 test
```

Do not weaken negative tests, JSON-keystore parameters, local-only exposure,
file permissions, structured commitment validation, or the distinction between
local lock and on-chain revocation for convenience.

## Changes

- Keep commits focused and update architecture and TODO documentation with
  behavior changes.
- Add positive, rejection, restart, and sanitized-output tests for signer work.
- Do not describe unaudited code or private-test evidence as production-ready.
- Run `git diff --check` and the focused test suite before proposing a change.

Report suspected vulnerabilities privately according to [SECURITY.md](../security/SECURITY.md).
