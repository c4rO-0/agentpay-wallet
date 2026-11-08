# Changelog

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
