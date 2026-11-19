# Compatibility retirement review — 2026-11-19

This is the bounded R11 supplement to the completed source review, not a repeated
whole-repository audit. Inspected current public entries, callers, persisted-state
readers and package exports. Public availability is not proof of zero external users.

| Surface | Disposition, evidence and exit condition |
| --- | --- |
| Direct `openSettlementDispute` / `dispute.open` | Remove under the approved pre-launch retirement. Current case access/read/result operations remain; User and server consumers use those operations. The pending IPC/action/payload removal and rejection regression were reviewed together. It does not rewrite an Order or decide a case. Deliver in a separately authorized release. |
| Original-Policy read authorization | Retain: `wallet.ts` checks exact network/Module/Safe, reads the original Policy and verifies delegate possession; only order.read is signed. It is needed after renewal, not a second spending route. Exit only with a replacement preserving historical scopes. |
| Renewal/migration journals and key recovery | Retain: `policy-renewal.ts`, `policy-migration.ts`, `policy-restore.ts` preserve interrupted owner operations and key possession checks. Never remove merely because a normal setup has finished. |
| Versioned response normalization | Retain: `settlement-http.ts` consumes published Protocol projections and historical order deadlines. Unknown/malformed fields do not become successful new requests. Retire only with coordinated wire/data support. |
| Public client/local and capability roles | Retain: these are intentionally distinct authority surfaces, not redundant aliases. Installed User consumes both at their respective boundaries. |

## Verification and closeout

Existing [static review](mainnet-static-review-2026-11-15.md) remains the R1–R10 evidence. TypeScript compilation and the Settlement-request regression suite cover retirement, support proof scopes, malformed requests and bounded loopback HTTP/RPC behavior. No live transaction was made.

R11 is complete with the dispositions above. No new unresolved source blocker or
transaction-design decision was identified. Retained adapters have named consumers
or public compatibility boundaries; they are not unconditional removal TODOs.
Source completion does not publish packages or prove mainnet/deployment acceptance.
