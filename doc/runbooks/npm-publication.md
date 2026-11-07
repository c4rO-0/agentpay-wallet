# Publish Wallet to npm

Maintainers publish the standalone Wallet package; this does not deploy a service
or upgrade User. Version 0.3.0 needs the planned User package integration before it
can replace the existing source pair.

## First publication

Use a clean reviewed source revision with Node 22.22.3 or newer and pnpm 10.
Install frozen dependencies, run `pnpm build` and the behavioral suite, then:

```bash
node scripts/test-package.mjs artifacts/npm
```

This retains the exact tarball that passed independent installation, TypeScript
consumer and real IPC/process checks. It does not publish. Inspect the package's
file list and README before uploading.

Authenticate to npm as the maintainer using `npm login --auth-type=web`. Never put
tokens in this repository or send them in chat. Publish the verified artifact:

```bash
npm publish artifacts/npm/c4roa0-agentpay-wallet-0.3.0.tgz --access public --ignore-scripts --registry=https://registry.npmjs.org/
node scripts/verify-npm-release.mjs artifacts/npm/c4roa0-agentpay-wallet-0.3.0.tgz 0.3.0
```

If npm requires staged-release approval, complete it on npm before registry
verification. A timeout does not prove publication failed: inspect the registry
before retrying. Registry integrity must match the tested archive.

## Subsequent trusted publication

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
