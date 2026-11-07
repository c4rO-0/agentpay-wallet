/**
 * Trusted local administration, not the Agent/Skill API. Callers already have
 * filesystem access to the user's private Wallet directory. Runtime calls use
 * the client entry and the existing capability-scoped process boundary.
 */
export { Phase0Wallet } from "./wallet.js";
export { initializeCapabilities } from "./ipc.js";
export { WalletError } from "./errors.js";
export type { Phase0Policy } from "./commitment.js";
