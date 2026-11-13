# Changelog

## 0.3.5 — 2026-11-13

- Validate Market nicknames before signing, including normalized length and unsafe formatting characters.
- Preserve multilingual names and emoji joiners; no payment authority changes.

## 0.3.4 — 2026-11-12

- Explain blockchain RPC connection failures during Policy-backed reads without exposing request details.
- Keep original Order identity and authorization checks unchanged.

## 0.3.3 — 2026-11-10

- Report service maintenance clearly through the Wallet client and IPC.
- Preserve original Order and cancellation identifiers; maintenance does not trigger automatic write retries.
- No signing, Policy, capability or storage changes.

## 0.3.2 — release candidate

- Align installation and integration guides with the published npm User/Wallet flow.
- Clarify exact dependency pairing and service restart responsibilities.
- No signing, capability, Policy, storage or wire-format changes.

## 0.3.1 — 2026-11-08

- Report running software versions through read-only status for client repair checks.
- Report the resolved Protocol package version, including nested npm installations.
- Preserve existing Policy version, capabilities and signing rules.

## 0.3.0 — standalone npm package, 2026-11-07

- Add explicit public IPC client, trusted local administration and CLI entries.
- Package compiled runtime files without source tests or development builds.
- Consume public Protocol 0.14.3. No signing, authorization or wire-format changes.
- User 0.2.0 source installation is not compatible with this package; keep the
  existing pair until User npm integration is available.

## 0.2.0 — source distribution

Source-only Wallet used by the previous sibling User/Wallet installation flow.
