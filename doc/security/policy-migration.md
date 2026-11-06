# Policy migration boundaries

## Authorized scope

The User approved reusable, owner-confirmed deployment migration. Initial bind
remains one-time. Migration retains Safe/network/delegate/token/Registry and
replaces the Policy ID and compatible Module/Factory, carrying remaining budget
and unchanged expiry. Key rotation and more allowance are separate decisions.

## Enforcement

- Agent capability cannot call any migration method. No generic signing or
  owner-key import was added. Tests verify the administrator boundary.
- Prepare recomputes chain state and requires its plan digest to match the
  approved preview. Extra target fields cannot supply budget/expiry/identities.
- Wallet uses its existing RPC and explicitly checks chainId, code existence,
  same-block source/target Policy state, old revocation, exact new fields, enabled
  Module, active validity and zero new spending. Overlap or mismatches fail closed.
- Old signed commitments can race revocation: local lock cannot stop them. Drain
  is an operator prerequisite. Changed spending stops the flow. Refresh requires
  explicit approval, the same absent destination and only a reduced remainder.
- Durable pending journal precedes owner transactions; restart preserves the
  signing/unlock pause. Either side of an interrupted binding write must match
  this exact plan and pass chain checks again. History is archived; encrypted
  key and capability files are unchanged. Completed migration stays locked.
- Cancel only before old revocation and while target absent; no automatic chain
  rollback. Stale backups cannot reverse revocation or reset on-chain spending.
- Wallet produces and verifies bounded operations but does not sign as the Safe
  owner. User coordinates external approval; the required owner threshold remains
  the Safe's rule. Test signer helpers are not distributed with Wallet.

## Remaining trust and evidence limits

The administrator and same-UID private filesystem remain a trusted-host boundary.
RPC honesty, network finality and trusted deployed code are separate prerequisites;
code existence/ABI matching are not audits. Proxy/incompatible upgrades, external
Safe UI, multi-generation Settlement and production confirmation depth are not
certified here. Operators must drain old work before the Wallet pause, which also
blocks authenticated recovery/notice requests.

Tests use simulated RPC with real Wallet processes, SIGKILL recovery and an
injected partial-binding checkpoint. That is not a filesystem power-loss proof.
Private owner-signing evidence does not establish every supported network, owner
threshold or interruption scenario. Keep those acceptance claims separate.
The owner-facing steps are in the
[agentpay-user: Policy migration procedure](https://github.com/c4rO-0/agentpay-user/blob/main/doc/runbooks/safe-policy-migration.md).
