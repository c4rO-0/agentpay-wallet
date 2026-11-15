# Wallet TODO

## Current review and release

- [x] Complete the bounded code, comment and documentation review.
- [x] Fix W1–W4 and related IPC, filesystem and input-validation boundaries.
- [x] Run behavioral regressions and independent package installation; complete focused rereview.
- [x] Consolidate documentation, preserve historical task states and refresh contributor navigation.
- [x] Complete R1–R10 coverage and prepare the reviewed source/documentation closeout commit.
- [ ] When authorized, publish the corrections with matching manifest/tag and verify npm integrity.
- [ ] Coordinate User’s exact Wallet dependency update and relevant integration checks.
- [ ] After Protocol publishes its reviewed corrections, evaluate and verify the dependency upgrade.

See [review findings and evidence](records/mainnet-static-review-2026-11-15.md).
Source verification does not establish live financial acceptance or publication.

## Integration evidence to reconcile

These are retained acceptance gaps, not a request to repeat every older rehearsal.
Match existing dated evidence to each claim before scheduling further work. Add a
new check only for a concrete uncovered boundary.

- [ ] Reconcile participant naming, fresh install, upgrade/interruption, restart,
  uninstall and paid-test evidence with the owning User/Market release records.
- [ ] Record fresh public clone/ZIP consumption separately from the verified npm tarball.
- [ ] Review actual interruption coverage at renewal/migration write boundaries;
  prepared journal fixtures are not process-crash evidence.
- [ ] Confirm supported external-owner, multisig/headless and network scope, historical
  Policy isolation, and financial recovery with the components owning those flows.
- [ ] Keep independent security review and supported-version policy explicit for
  real-funds decisions; local passing tests do not establish them.

## Deferred scope

- Compatible dependency ranges require a verified matrix; exact reviewed pins remain.
- macOS startup and graphical unlock await an agreed, testable scope.
- Combined source ZIPs and standalone binaries are optional distribution work.

## Historical traceability

[Original task ledger](archive/todo-through-2026-11-15.md) retains all prior checked
and unchecked entries. [Progress history](archive/progress-through-2026-11-13.md)
contains release evidence. Public CI already runs the independent behavior suite
through the publication workflow; the old “establish public CI” item is superseded.
Private records removed during public-source preparation remain outside this
repository; their absence is not cancellation or acceptance.
