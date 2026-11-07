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
