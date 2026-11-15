# Wallet static review — 2026-11-15

Baseline: `7bde999`, Wallet 0.3.5, Protocol dependency 0.14.3.
Initial findings below describe the reviewed baseline; the correction outcome is
recorded at the end. At the first pass Wallet was **not cleared**. Three lifecycle failures were reproduced with disposable keys,
files and real local processes. The initial increment added comments and corrected manuals before runtime fixes.

## Coverage and logic map

Reviewed the source modules, public package/CLI entries, package construction and
publication workflow, behavior-test coverage, and current contributor/usage/security
guides. Historical records retain their original evidence scope.

```text
CLI / public client
  -> IPC framing -> capability role -> fixed method dispatch
    -> Wallet state and transition fences
      -> payment: canonical commitment -> Registry read -> state recheck -> key signature
      -> support: canonical action -> current/original Policy proof -> HTTP -> response checks
      -> administration: chain inspection -> pending journal -> archive -> binding -> completion
```

Comments in the coordinator and adapters now describe these transitions and their
ownership. They do not imply that signature creation proves payment, that local
state is chain authority, or that an in-process fence coordinates two processes.

## Original findings

### W1 — High: an in-flight unlock can undo a later lock

`src/keystore.ts`, `unlock()` / `lock()`; `src/wallet.ts`, `unlock()`.
Decryption yields, then unconditionally assigns the decrypted signer. `lock()`
clears only the current signer. Reproduction: start a real unlock, await a lock,
then await the original unlock. State was locked after lock returned, but unlocked
after decryption completed. No password bypass is involved; a prior authorized
unlock finishes after the user's later stop instruction.

Correction: invalidate pending unlock attempts on lock/destruction and reject stale
completion before installing a signer. Include concurrent unlock ordering and
migration-triggered lock. Verify through public Wallet lifecycle/IPC, not just a
private counter assertion. Do not claim cancellation revokes signatures already issued.

### W2 — High: duplicate service startup steals the socket

`src/ipc.ts`, `startWalletServer()` / returned `close()`.
Startup unconditionally unlinks `wallet.sock`. Two real child processes using one
temporary directory both became ready. The second answered status; stopping the
first removed the second's socket, after which the client received ENOENT.
The processes also have independent binding/journal/mutation state.

Correction: enforce one owner per Wallet data directory before opening mutable
state, distinguish a stale socket from a live owner, and let cleanup remove only
its own endpoint. An advisory probe alone does not close simultaneous-start races.
Reuse an appropriate portable ownership mechanism; avoid adding Linux-only process
identity as the public library contract. User's service manager is an additional
boundary, not a replacement for standalone Wallet ownership. No duplicate on-chain
funding was demonstrated; Module replay checks are separate.

### W3 — Medium: rejection auditing can terminate the service

`src/ipc.ts`, `dispatch()` and its promise boundary.
If audit append fails, the catch block itself rejects. The socket callback handles
only fulfillment, so Node terminates on the unhandled rejection. With a disposable
audit path made unwritable as a directory fixture, an invalid-capability request
caused the real Wallet process to exit with code 1.

Correction: handle the asynchronous dispatch boundary, return a safe reviewed error
when audit persistence fails, and preserve uncertainty about any earlier operation.
Do not turn an audit failure after signing into a claim that nothing happened.
Bound socket errors and single-request framing in the same transport correction.

### W4 — Medium: signing-time Registry inspection asserts rather than checks chain identity

`src/commitment.ts`, `assertRegistryQualification()` uses `staticNetwork: true`.
Unlike restore/migration inspection, it does not query the RPC's actual chain ID.
A misdirected RPC can therefore qualify against the wrong chain before Wallet signs.
Module redemption still independently checks qualification on the actual chain;
this finding is not evidence that the on-chain Registry guard can be bypassed.

Correction: explicitly compare eth_chainId before qualification and use a bounded
RPC timeout with reviewed errors. Preserve configured Provider HTTP/HTTPS support;
this check concerns blockchain RPC identity, not service-business selection.
Evidence here is static inspection, not a live wrong-network payment attempt.

## Bounded follow-ups in the same correction pass

- `callWallet` has no deadline/response-size bound and the server has no per-connection
  consumed flag. A second chunk can dispatch another request while the first awaits;
  a silent peer can leave the client pending. Preserve no-automatic-write-retry behavior.
- `ensurePrivateDirectory` chmods before rejecting a symlink/non-directory and does not
  check ownership. Validate the directory before permission changes; do not touch the
  symlink target on rejection. Same-OS-user code remains outside a sandbox guarantee.
- Expected input failures in Market URL parsing and accepted Quote/selector parsing
  can become INTERNAL_ERROR. Map these to useful reviewed field errors; do not echo
  private URLs, signatures or payloads. Coercing action IDs from arrays is also
  inconsistent with the declared wire types and should be rejected at ingress.

## Documentation changes

Corrected present-tense claims that the public client and User adoption are still
planned/candidate features; removed stale release authorization from AGENTS.
Clarified that Settlement issues case-access codes after Wallet signs a request.
Added flow/ordering comments in Wallet, IPC, HTTP, migration and key publication.
Valid signed bytes and schemas are unchanged. The correction adds the native lock
dependency described below; Protocol remains pinned to 0.14.3.

## Initial-pass evidence and planned correction

- Source build passed.
- Existing lifecycle, migration and historical-read suites: ten tests passed, using
  temporary storage/processes and controlled RPC. Their passing does not cover W1–W3;
  the separate reproductions demonstrate those missing failure boundaries.
- Reproductions used a disposable Wallet and two/three actual child processes;
  no existing installation, key, Policy, Market connection, service or chain was changed.
- No new npm installation/publication, Anvil transaction, live payment or independent
  security audit occurred. Protocol's recently committed validation fixes are not in
  the pinned 0.14.3 dependency; delivery remains a later explicit package upgrade.

The initial next loop was to fix W1–W4 and the related bounded transport/filesystem diagnostics,
add meaningful regressions for these exact failures, then perform one focused
correction review. Do not proceed as if Wallet is approved or start another broad
rehearsal without a concrete need.

## Correction outcome — 2026-11-15

W1–W4 and all three bounded follow-ups above are fixed and rereviewed:

- Lock/destruction invalidate pending unlocks; only the latest unlock may install
  its signer. This does not revoke a signature already issued.
- Service startup holds an OS descriptor lock before reading mutable Wallet state.
  Shutdown stops admission and drains operations before releasing ownership. The
  persistent `service-owner.lock` must not be deleted as stale-file cleanup.
  Key import takes the same lock and accepts this file after failed pre-key startup.
- IPC dispatch/audit failures return reviewed errors without terminating the service.
  One request is consumed per connection; clients have a deadline and response cap,
  without automatic retries. Audit failures retain uncertainty about prior effects.
- Registry reads explicitly verify chain identity before qualification and use a
  10-second per-request deadline. Wrong-chain and unavailable RPC errors are distinct.
- Directory type/ownership is checked before chmod, using a no-follow descriptor;
  malformed action identifiers, selectors and URLs receive reviewed field errors.

Validation: TypeScript build and all 36 behavioral tests passed. New regressions use
real decryptions, Unix sockets and competing child processes, including SIGKILL and
restart, plus controlled RPC fixtures for wrong-chain and timeout behavior. An
independently installed npm tarball passed public declarations, CLI, denied-capability
and restart/locked-state checks. No existing service, key, Policy or Order was changed.

`fs-native-extensions` 1.5.3 supplies descriptor locking (also used by User); Linux
package installation and behavior were verified here. Other platforms are not newly
certified. This is a completed bounded source review, not an independent security
audit, mainnet acceptance or npm release. Publication and User dependency adoption
remain separate authorized steps; published Wallet remains 0.3.5.

## R1–R10 closeout coverage

Baseline `7bde999` plus the source corrections recorded above. This reconciliation
also checked the public client/local entries, CLI lifecycle, packaging and current
User imports. Existing behavior/package evidence is reused, not replaced by a
checklist. No additional transaction-rule change was introduced.

| Area | Modules / entry points | Conclusion and remaining boundary |
| --- | --- | --- |
| R1 Design | wallet.ts, commitment.ts, design and architecture | Bounded signing and generic service handling retained; no example-business branch added. |
| R2 Flows | CLI/client/local → IPC → coordinator → signing/HTTP/journals | Traced payment, historical reads, Market proof and restore/renew/migration; original scopes remain independent. |
| R3 Recovery | keystore, service-owner, IPC, migration/renewal journals | W1–W3 fixed; actual process race/crash regression passes. Prepared migration checkpoints are not arbitrary mid-write crash acceptance. |
| R4 Security/funds | capability roles, commitments, historical scope and Registry | W4 fixed; signature/domain/amount gates preserved. Direct trusted imports and same-OS-user file access are not sandboxed. |
| R5 Interfaces | client/local exports, User consumers, frozen npm dependencies | Existing call signature preserved with optional deadline; native lock dependency included in standalone package verification. Consumer adoption awaits publication. |
| R6 Maintainability | coordinator, keystore, IPC, HTTP, journals and source map | Comments explain authority, ordering and recovery rather than restating syntax; no framework rewrite. |
| R7 Interaction | CLI errors, IPC errors, usage/recovery instructions | Reviewed input/audit/ownership errors actionable; standalone CLI is structured output, User owns friendly product guidance. |
| R8 Tests/CI | behavior suite, publish.yml, standalone tarball script | 36 checks and independent CLI/IPC package passed; real processes versus controlled RPC limits documented. |
| R9 Documentation | README, role catalog, guides, progress/TODO, archives | Current state separated from historical pending labels; unresolved evidence retained and local links checked. |
| R10 Release/operations | manifest/lock, package allowlist, release workflow/runbook | No version/tag/publication change; owner lock works on tested Linux. macOS remains deferred; no service/deployment changed. |

All ten areas have a recorded disposition. No unresolved finding in this scoped
review requires a transaction-rule decision. Commit these corrections, then review
User; package release and User adoption remain pending explicit authorization.
