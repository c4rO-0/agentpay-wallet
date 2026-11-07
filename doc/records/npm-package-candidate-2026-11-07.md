# Wallet npm candidate verification — 2026-11-07

Scope: unpublished `@c4roa0/agentpay-wallet@0.3.0`, Protocol dependency 0.14.3.
A clean temporary Wallet checkout contained no parent repository, node_modules,
build output or vendored dependency. Node 22.22.3 and pnpm 10 were used on Linux.

- Frozen dependency installation and source build passed.
- All 29 local behavioral tests passed, without skips.
- `pnpm test:package` built and packed compiled JavaScript/declarations, then
  installed the tarball into a separate npm project with install scripts disabled.
- Installed CLI help/version and public client/local imports worked. Internal
  keystore deep imports were rejected by package exports (an API boundary, not
  filesystem isolation).
- A disposable Wallet server accepted authorized status/address calls; rejected
  invalid capabilities, Agent unlock and generic signing; accepted admin unlock.
  Restart kept the same execution address and started locked.
- Package file-list validation excludes source, tests, fixtures, source maps and
  the test-only server process. npm automatically includes the documentation README.

An initial file-list assertion omitted that public documentation README; the
allowlist was corrected and the complete installed-package test rerun successfully.
No chain, live service, Policy, payment or participant data was used. Temporary
installations and disposable keys were cleaned. This does not establish User
integration, cross-platform support, npm registry publication or real-funds readiness.

User 0.2.0 still expects its previous source Wallet pair. It must adopt the public
package entries before this candidate can replace that pair in guided installation.

## Review follow-up

A second clean temporary installation verified the normal `npm pack` prepack hook
builds missing compiled files, then successfully installed that tarball with scripts
disabled. A strict NodeNext TypeScript consumer compiled against public client/local
entries and declarations. Installed CLI and the real IPC unlock/restart lifecycle
passed again. Documentation now uses public imports and distinguishes installed CLI
from source commands; links to source-only documents use the public repository.
No business rules or IPC permission allowlists changed.

## Public registry acceptance

The owner published 0.3.0 with a Token; npm initially returned 404 during processing,
then exposed the version. A separate read verified `latest: 0.3.0` and matching
SHA-512 integrity. The tested archive SHA-256 is
`f903b48d218a5ac29171c6c45d742f2b0eed25915f17986d9a2ea6ab83410981`.
Release source: `082a8db`.

Fresh npm registry installation with scripts disabled passed public CLI version/help,
IPC capability denial, admin unlock and locked restart preserving the execution
address. The temporary project and disposable keys were removed. Trusted Publisher
configuration and OIDC release for Wallet have not yet been verified.
