# Publish Wallet to npm

Publishing the standalone Wallet package does not deploy a service or upgrade User.
User adopts each reviewed Wallet version through its exact dependency and pairing
checks, after that Wallet version is available in the public registry.

## Prepare a release

Use a reviewed source revision with Node 22.22.3 or newer and pnpm 10. Update
`package.json` and the changelog, install frozen dependencies, build and run the
behavioral suite. Then verify the independent package:

```sh
node scripts/test-package.mjs artifacts/npm
```

This retains the tarball that passed standalone installation, TypeScript consumer
and real IPC/process checks. Inspect its file list and README. Never include local
configuration, keys or tokens. Commit and push the reviewed revision to main.

## Publish through GitHub

Configure the package's npm Trusted Publisher for GitHub Actions:

- Organization/user: `c4rO-0`
- Repository: `agentpay-wallet`
- Workflow filename: `publish.yml`
- Environment: `npm-publish`
- Allow direct publishing if the workflow should publish without a staged approval.

Create the matching GitHub environment and configure maintainer approvals as
appropriate. Run **Publish Wallet to npm** on main with the exact package version.
The workflow verifies behavior, tests the packed artifact, publishes that same
archive via OIDC, then checks registry integrity. It uses no stored npm token.

After verification, record the package version, source commit and evidence in
progress, and tag the corresponding source revision. Publishing Wallet does not
establish User compatibility, cross-platform acceptance or real-funds readiness.

A failed or timed-out verification does not prove publication failed. Check the
registry and match archive integrity before retrying. Never republish different
bytes under an already published version. If npm reports Pending validation, a
successful publication through this configured workflow must validate that trust;
a local token publication does not verify the GitHub publisher configuration.
