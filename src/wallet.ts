/**
 * Wallet state coordinator. Keep signing, local binding changes and restart
 * journals consistent; upstream payment success is not inferred here.
 */
import { validateRenewal } from "./policy-renewal.js";
import { assertUnixMilliseconds } from "@c4roa0/agentpay-protocol";
import { appendFile, open, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
  inspectPolicyRestore,
  normalizeRestoreTarget,
} from "./policy-restore.js";
import { JsonKeystoreBackend } from "./keystore.js";
import {
  assertRegistryQualification,
  buildCommitment,
  normalizePolicy,
  PHASE0_TYPES,
  type Phase0Policy,
} from "./commitment.js";
import {
  assertPrivateFile,
  atomicWritePrivate,
  ensurePrivateDirectory,
  exists,
} from "./files.js";
import { WalletError } from "./errors.js";
import {
  buildSettlementRequest,
  SETTLEMENT_REQUEST_TYPES,
} from "./settlement-request.js";
import {
  fail,
  inspectMigration,
  previewMigration,
  refreshMigration,
  normalizeTarget,
  samePolicy,
  validateJournal,
  withMigrationRpc,
  readPolicy,
  assertSource,
  type MigrationJournal,
} from "./policy-migration.js";

export class Phase0Wallet {
  readonly backend: JsonKeystoreBackend;
  readonly dataDir: string;
  #policy: Phase0Policy | null;
  // Local duplicate suppression resets on restart; it is not chain replay protection.
  #issued = new Set<string>();
  #migration: MigrationJournal | null = null;
  // Serializes mutations within this instance, not across independent processes.
  #migrationBusy = false;
  #renewalPending = false;

  private constructor(dataDir: string, policy: Phase0Policy | null = null) {
    this.dataDir = dataDir;
    this.#policy = policy;
    this.backend = new JsonKeystoreBackend(
      join(dataDir, "session.keystore.json"),
    );
  }

  static async initialize(
    dataDir: string,
    password: string,
  ): Promise<Phase0Wallet> {
    await ensurePrivateDirectory(dataDir);
    const wallet = new Phase0Wallet(dataDir);
    const created = await wallet.backend.create(password);
    wallet.backend.lock();
    await wallet.audit("create", "ok", {
      address: created.address,
      encryptionMs: created.encryptionMs,
      rssDeltaBytes: created.rssDeltaBytes,
    });
    return wallet;
  }

  static async open(dataDir: string): Promise<Phase0Wallet> {
    await ensurePrivateDirectory(dataDir);
    const policyPath = join(dataDir, "policy.json");
    let policy: Phase0Policy | null = null;
    if (await exists(policyPath)) {
      await assertPrivateFile(policyPath);
      policy = normalizePolicy(JSON.parse(await readFile(policyPath, "utf8")));
    }
    const wallet = new Phase0Wallet(dataDir, policy);
    const address = await wallet.backend.address();
    if (policy && policy.delegate !== address) {
      throw new WalletError(
        "POLICY_KEY_MISMATCH",
        "bound policy delegate does not match the local session key",
      );
    }
    const migrationPath = join(dataDir, "policy-migration.json");
    if (await exists(migrationPath)) {
      await assertPrivateFile(migrationPath);
      wallet.#migration = validateJournal(
        JSON.parse(await readFile(migrationPath, "utf8")),
      );
      const { plan, state } = wallet.#migration;
      if (
        !policy ||
        !(state === "pending"
          ? samePolicy(policy, plan.source) ||
            samePolicy(policy, plan.destination)
          : samePolicy(
              policy,
              state === "completed" ? plan.destination : plan.source,
            ))
      )
        fail("MIGRATION_LOCAL_POLICY_CONFLICT");
    }
    const renewalPath = join(dataDir, "policy-renewal.json");
    if (await exists(renewalPath)) {
      await assertPrivateFile(renewalPath);
      const journal = JSON.parse(await readFile(renewalPath, "utf8"));
      if (
        journal.version !== 1 ||
        !["pending", "completed"].includes(journal.state)
      )
        fail("RENEWAL_JOURNAL_INVALID");
      const source = normalizePolicy(journal.source),
        destination = normalizePolicy(journal.destination);
      if (
        !policy ||
        (journal.state === "pending" &&
          !samePolicy(policy, source) &&
          !samePolicy(policy, destination))
      )
        fail("RENEWAL_LOCAL_POLICY_CONFLICT");
      wallet.#renewalPending = journal.state === "pending";
    }
    return wallet;
  }

  get policy(): Phase0Policy | null {
    return this.#policy;
  }

  /** Local snapshot only: bound does not imply current chain spending readiness. */
  status() {
    return {
      locked: this.backend.locked,
      bound: this.#policy !== null,
      version: this.#policy?.version ?? "unbound",
      policyId: this.#policy?.policyId ?? null,
      recoveryScope: this.#policy
        ? {
            network: `eip155:${this.#policy.chainId}`,
            module: this.#policy.module,
            safe: this.#policy.safe,
            policyId: this.#policy.policyId,
          }
        : null,
      ...(this.#migration?.state === "pending"
        ? { policyMigrationPending: true }
        : {}),
      ...(this.#renewalPending ? { policyRenewalPending: true } : {}),
    };
  }

  async address(): Promise<string> {
    return this.backend.address();
  }

  marketConnectionScope() {
    this.#assertNotMigrating();
    if (!this.#policy)
      throw new WalletError("POLICY_UNBOUND", "Complete Wallet setup first");
    const p = this.#policy;
    return {
      network: `eip155:${p.chainId}`,
      module: p.module.toLowerCase(),
      safe: p.safe.toLowerCase(),
      policyId: p.policyId.toLowerCase(),
      delegate: p.delegate.toLowerCase(),
    };
  }

  async unlock(
    password: string,
  ): Promise<{ address: string; decryptionMs: number; rssDeltaBytes: number }> {
    this.#assertNotMigrating(true);
    const result = await this.backend.unlock(password);
    if (this.#migrationBusy || this.#migration?.state === "pending") {
      this.backend.lock();
      fail("POLICY_MIGRATION_PENDING");
    }
    await this.audit("unlock", "ok", {
      address: result.address,
      decryptionMs: result.decryptionMs,
      rssDeltaBytes: result.rssDeltaBytes,
    });
    return result;
  }

  async lock(): Promise<void> {
    this.backend.lock();
    await this.audit("lock", "ok");
  }

  async bindPolicy(policyInput: unknown): Promise<Phase0Policy> {
    this.#assertNotMigrating();
    this.#migrationBusy = true;
    try {
      return await this.#bindPolicy(policyInput);
    } finally {
      this.#migrationBusy = false;
    }
  }
  // First local binding checks structure/key identity. The owner flow verifies chain
  // operations separately; this method must not be documented as a full chain audit.
  async #bindPolicy(policyInput: unknown): Promise<Phase0Policy> {
    if (this.#policy || (await exists(join(this.dataDir, "policy.json")))) {
      throw new WalletError(
        "POLICY_ALREADY_BOUND",
        "session key is already bound to a policy",
      );
    }
    const policy = normalizePolicy(policyInput);
    const address = await this.backend.address();
    if (policy.delegate !== address) {
      throw new WalletError(
        "POLICY_KEY_MISMATCH",
        "policy delegate does not match the local session key",
      );
    }
    await atomicWritePrivate(
      join(this.dataDir, "policy.json"),
      JSON.stringify(policy, null, 2),
    );
    this.#policy = policy;
    await this.audit("bindPolicy", "ok", {
      address,
      policyId: policy.policyId,
    });
    return policy;
  }

  async previewPolicyRestore(input: unknown) {
    this.#assertNotMigrating();
    if (this.backend.locked)
      throw new WalletError(
        "LOCKED",
        "Unlock Wallet to verify the original key",
      );
    const result = await inspectPolicyRestore(input, await this.address());
    if (this.#policy && !samePolicy(this.#policy, result.policy))
      throw new WalletError(
        "POLICY_ALREADY_BOUND",
        "Keep the existing binding; restoration cannot replace another Policy",
      );
    return result;
  }

  async restorePolicy(input: unknown) {
    // Shares the administrative mutation fence with Policy migration. Re-read
    // the chain at confirmation; never trust the User preview as authority.
    this.#assertNotMigrating();
    this.#migrationBusy = true;
    try {
      if (this.backend.locked)
        throw new WalletError("LOCKED", "Unlock Wallet first");
      const result = await inspectPolicyRestore(input, await this.address());
      if (this.#policy) {
        if (!samePolicy(this.#policy, result.policy))
          throw new WalletError(
            "POLICY_ALREADY_BOUND",
            "Cannot replace an existing Policy",
          );
        return result;
      }
      await this.#bindPolicy(result.policy);
      return result;
    } finally {
      this.#migrationBusy = false;
    }
  }

  async renewPolicy(input: unknown) {
    if (this.#migrationBusy || this.#migration?.state === "pending")
      fail("POLICY_MIGRATION_PENDING");
    this.#migrationBusy = true;
    try {
      if (this.backend.locked) fail("LOCKED");
      if (!this.#policy) fail("POLICY_UNBOUND");
      const current = this.#policy;
      const value = input as { expectedPolicyId?: string; target?: unknown };
      if (
        !value ||
        typeof value !== "object" ||
        Object.keys(value).sort().join() !== "expectedPolicyId,target"
      )
        fail("RENEWAL_TARGET_INVALID");
      const target = normalizeRestoreTarget(value.target, await this.address());
      if (
        target.chainId !== current.chainId ||
        target.safe !== current.safe ||
        target.registryRpcUrl !== current.registryRpcUrl
      )
        fail("RENEWAL_IDENTITY_MISMATCH");
      const inspected = await inspectPolicyRestore(
        value.target,
        await this.address(),
      );
      if (inspected.policy.validUntil <= Math.floor(Date.now() / 1000))
        fail("RENEWAL_EXPIRED");
      if (current.policyId === inspected.policy.policyId) {
        if (!samePolicy(current, inspected.policy)) fail("RENEWAL_CONFLICT");
        // Retry may finish the journal after a crash following the binding write.
        const path = join(this.dataDir, "policy-renewal.json");
        if (!(await exists(path))) fail("RENEWAL_CONFLICT");
        await assertPrivateFile(path);
        const saved = JSON.parse(await readFile(path, "utf8"));
        if (
          saved.source?.policyId !== value.expectedPolicyId ||
          !samePolicy(saved.destination, current)
        )
          fail("RENEWAL_CONFLICT");
        await this.#durableWrite(path, { ...saved, state: "completed" });
        this.#renewalPending = false;
        return { policy: current, completed: true };
      }
      if (current.policyId !== value.expectedPolicyId)
        fail("RENEWAL_SOURCE_CONFLICT");
      const sourceRevoked = await withMigrationRpc(current, async (rpc) => {
        const block = await rpc.getBlock("latest");
        if (!block) fail("RENEWAL_CHAIN_UNAVAILABLE");
        const original = await readPolicy(rpc, current, block.number);
        assertSource(current, original);
        return original.revoked;
      });
      const pair = validateRenewal(
        current,
        inspected.policy,
        Math.floor(Date.now() / 1000),
        sourceRevoked,
      );
      if (inspected.terms.spent !== "0") fail("RENEWAL_TARGET_ALREADY_USED");
      const path = join(this.dataDir, "policy-renewal.json");
      if (this.#renewalPending) {
        await assertPrivateFile(path);
        const saved = JSON.parse(await readFile(path, "utf8"));
        if (
          !samePolicy(saved.source, pair.source) ||
          !samePolicy(saved.destination, pair.destination)
        )
          fail("RENEWAL_CONFLICT");
      }
      this.#renewalPending = true;
      const journal = { version: 1, state: "pending", ...pair };
      await this.#durableWrite(path, journal);
      // Archive old scope before publishing the new binding. Keep all Order data.
      await this.#durableWrite(
        join(this.dataDir, "policy-renewals", pair.source.policyId + ".json"),
        journal,
      );
      if (this.#migration) {
        await this.#writeMigrationArchive(this.#migration);
        await unlink(join(this.dataDir, "policy-migration.json"));
        this.#migration = null;
      }
      await this.#durableWrite(
        join(this.dataDir, "policy.json"),
        pair.destination,
      );
      this.#policy = pair.destination;
      await this.#durableWrite(path, { ...journal, state: "completed" });
      this.#renewalPending = false;
      await this.audit("renewPolicy", "ok", {
        oldPolicyId: pair.source.policyId,
        newPolicyId: pair.destination.policyId,
      });
      return { policy: pair.destination, completed: true };
    } finally {
      this.#migrationBusy = false;
    }
  }

  async previewPolicyMigration(target: unknown) {
    this.#assertNotMigrating();
    if (!this.#policy) fail("POLICY_UNBOUND");
    return previewMigration(this.#policy, target);
  }

  async preparePolicyMigration(target: unknown, expectedMigrationId: string) {
    return this.#migrationOperation(async () => {
      if (this.#migration?.state === "pending") {
        if (this.#migration.plan.migrationId !== expectedMigrationId)
          fail("MIGRATION_CONFLICT");
        const targetPlan = normalizeTarget(target, this.#migration.plan.source);
        const destination = this.#migration.plan.destination;
        if (
          targetPlan.policyId !== destination.policyId ||
          targetPlan.factory !== destination.factory ||
          targetPlan.module !== destination.module
        )
          fail("MIGRATION_CONFLICT");
        return this.policyMigrationStatus();
      }
      if (!this.#policy) fail("POLICY_UNBOUND");
      const plan = await previewMigration(this.#policy, target);
      if (plan.migrationId !== expectedMigrationId)
        fail("MIGRATION_PREVIEW_CHANGED");
      if (this.#migration) await this.#writeMigrationArchive(this.#migration);
      const pending: MigrationJournal = { plan, state: "pending" };
      // Pause before persistence, so an ambiguous disk failure stays fail-closed in this process.
      this.#migration = pending;
      await this.#saveMigration(pending);
      await this.audit("preparePolicyMigration", "ok", {
        migrationId: plan.migrationId,
        oldPolicyId: plan.source.policyId,
        newPolicyId: plan.destination.policyId,
      });
      return this.policyMigrationStatus();
    });
  }

  async policyMigrationStatus() {
    if (!this.#migration) return { state: "none" as const };
    const journal = this.#migration;
    return {
      ...journal,
      ...(journal.state === "cancelled"
        ? {}
        : { chain: await inspectMigration(journal.plan) }),
    };
  }

  async previewPolicyMigrationRefresh() {
    if (this.#migration?.state !== "pending") fail("MIGRATION_NOT_PENDING");
    return {
      previousMigrationId: this.#migration.plan.migrationId,
      plan: await refreshMigration(this.#migration.plan),
    };
  }

  async refreshPolicyMigration(
    previousMigrationId: string,
    expectedMigrationId: string,
  ) {
    return this.#migrationOperation(async () => {
      const journal = this.#requireMigration(previousMigrationId);
      if (journal.state !== "pending") fail("MIGRATION_NOT_PENDING");
      const plan = await refreshMigration(journal.plan);
      if (plan.migrationId !== expectedMigrationId)
        fail("MIGRATION_PREVIEW_CHANGED");
      await this.#writeMigrationArchive(journal);
      const pending: MigrationJournal = { state: "pending", plan };
      // Preserve pending state even if a write acknowledgement is ambiguous.
      this.#migration = pending;
      await this.#saveMigration(pending);
      await this.audit("refreshPolicyMigration", "ok", {
        previousMigrationId,
        migrationId: plan.migrationId,
      });
      return this.policyMigrationStatus();
    });
  }

  async completePolicyMigration(migrationId: string) {
    return this.#migrationOperation(async () => {
      const journal = this.#requireMigration(migrationId);
      if (journal.state === "cancelled") fail("MIGRATION_CANCELLED");
      const chain = await inspectMigration(journal.plan);
      if (!chain.readyToBind) fail("MIGRATION_CHAIN_NOT_READY");
      if (journal.state === "completed") return this.policyMigrationStatus();
      if (chain.targetSpent !== "0") fail("MIGRATION_TARGET_ALREADY_USED");
      // The pending journal survives a crash on either side of the binding write.
      // Opening it allows only the exact source/destination and keeps signing disabled.
      await this.#writeMigrationArchive(journal);
      await this.#durableWrite(
        join(this.dataDir, "policy.json"),
        journal.plan.destination,
      );
      this.#policy = journal.plan.destination;
      const completed: MigrationJournal = { ...journal, state: "completed" };
      await this.#saveMigration(completed);
      this.#migration = completed;
      await this.#writeMigrationArchive(completed);
      await this.audit("completePolicyMigration", "ok", {
        migrationId,
        oldPolicyId: journal.plan.source.policyId,
        newPolicyId: journal.plan.destination.policyId,
        blockNumber: chain.blockNumber,
        blockHash: chain.blockHash,
      });
      return this.policyMigrationStatus();
    });
  }

  async cancelPolicyMigration(migrationId: string) {
    return this.#migrationOperation(async () => {
      const journal = this.#requireMigration(migrationId);
      if (journal.state === "cancelled") return this.policyMigrationStatus();
      if (journal.state !== "pending") fail("MIGRATION_ALREADY_COMPLETED");
      // Cancellation is possible only before the first owner transaction. A changed
      // spent value can be safely re-previewed after cancellation; revocation cannot.
      await withMigrationRpc(journal.plan.source, async (rpc) => {
        const block = await rpc.getBlock("latest");
        if (!block) fail("MIGRATION_CHAIN_UNAVAILABLE");
        const old = await readPolicy(rpc, journal.plan.source, block.number);
        const next = await readPolicy(
          rpc,
          journal.plan.destination,
          block.number,
        );
        assertSource(journal.plan.source, old);
        if (old.revoked || !/^0x0+$/i.test(next.delegate))
          fail("MIGRATION_CANNOT_CANCEL");
      });
      const cancelled: MigrationJournal = { ...journal, state: "cancelled" };
      await this.#saveMigration(cancelled);
      this.#migration = cancelled;
      await this.#writeMigrationArchive(cancelled);
      await this.audit("cancelPolicyMigration", "ok", { migrationId });
      return this.policyMigrationStatus();
    });
  }

  #assertNotMigrating(allowRenewal = false) {
    if (
      (!allowRenewal && this.#renewalPending) ||
      this.#migrationBusy ||
      this.#migration?.state === "pending"
    )
      fail("POLICY_MIGRATION_PENDING");
  }
  #requireMigration(id: string): MigrationJournal {
    if (!this.#migration || this.#migration.plan.migrationId !== id)
      fail("MIGRATION_CONFLICT");
    return this.#migration;
  }
  async #migrationOperation<T>(run: () => Promise<T>): Promise<T> {
    if (this.#renewalPending || this.#migrationBusy) fail("MIGRATION_BUSY");
    this.#migrationBusy = true;
    this.backend.lock();
    try {
      return await run();
    } finally {
      this.#migrationBusy = false;
    }
  }
  async #durableWrite(path: string, value: unknown) {
    await atomicWritePrivate(path, JSON.stringify(value, null, 2));
    const directory = await open(join(path, ".."), "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }
  async #saveMigration(journal: MigrationJournal) {
    await this.#durableWrite(
      join(this.dataDir, "policy-migration.json"),
      journal,
    );
  }
  async #writeMigrationArchive(journal: MigrationJournal) {
    await this.#durableWrite(
      join(
        this.dataDir,
        "policy-migrations",
        `${journal.plan.migrationId}.json`,
      ),
      journal,
    );
    const directory = await open(this.dataDir, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  async signAgentPayCommitment(
    input: unknown,
    nowSeconds = Math.floor(Date.now() / 1000),
  ) {
    this.#assertNotMigrating();
    if (!this.#policy)
      throw new WalletError(
        "POLICY_UNBOUND",
        "session key is not bound to a policy",
      );
    const policy = this.#policy;
    const built = buildCommitment(policy, input, nowSeconds);
    await assertRegistryQualification(policy, input);
    // RPC yielded control: a concurrent administrative operation may have changed state.
    this.#assertNotMigrating();
    if (!samePolicy(policy, this.#policy))
      fail("MIGRATION_LOCAL_POLICY_CONFLICT");
    if (this.#issued.has(built.commitmentId)) {
      throw new WalletError(
        "DUPLICATE_COMMITMENT",
        "commitment was already signed locally",
      );
    }
    const signature = await this.backend.signTypedData(
      built.domain,
      PHASE0_TYPES,
      built.message,
    );
    this.#issued.add(built.commitmentId);
    await this.audit("signAgentPayCommitment", "ok", {
      commitmentId: built.commitmentId,
    });
    return {
      version: this.#policy.version,
      commitmentId: built.commitmentId,
      signature,
    };
  }

  /** Authorize only an original-Policy read, without switching the current binding. */
  async signHistoricalOrderRead(
    input: unknown,
    scope: unknown,
    nowSeconds = Math.floor(Date.now() / 1000),
  ) {
    this.#assertNotMigrating();
    if (!this.#policy)
      throw new WalletError("POLICY_UNBOUND", "Wallet is not bound");
    const current = this.#policy;
    if (!scope || typeof scope !== "object" || Array.isArray(scope))
      throw new WalletError(
        "RECOVERY_SCOPE_INVALID",
        "Original authorization is incomplete",
      );
    const s = scope as Record<string, unknown>;
    if (
      Object.keys(s).sort().join(",") !== "module,network,policyId,safe" ||
      s.network !== `eip155:${current.chainId}` ||
      String(s.module).toLowerCase() !== current.module.toLowerCase() ||
      String(s.safe).toLowerCase() !== current.safe.toLowerCase() ||
      typeof s.policyId !== "string" ||
      !/^0x[0-9a-f]{64}$/i.test(s.policyId)
    )
      throw new WalletError(
        "RECOVERY_SCOPE_INVALID",
        "Original authorization differs from this Wallet deployment",
      );
    if ((input as Record<string, unknown>)?.action !== "order.read")
      throw new WalletError(
        "INVALID_ACTION",
        "Historical authorization is read-only",
      );
    const target = { ...current, policyId: s.policyId };
    const terms = await withMigrationRpc(target, async (rpc) => {
      const block = await rpc.getBlock("latest");
      if (!block)
        throw new WalletError(
          "RECOVERY_POLICY_UNAVAILABLE",
          "Original authorization could not be checked",
        );
      return readPolicy(rpc, target, block.number);
    });
    if (
      terms.delegate.toLowerCase() !==
        (await this.backend.address()).toLowerCase() ||
      terms.validAfter > nowSeconds
    )
      throw new WalletError(
        "RECOVERY_POLICY_UNAVAILABLE",
        "Original authorization is not available to this Session Key",
      );
    this.#assertNotMigrating();
    if (!samePolicy(current, this.#policy))
      throw new WalletError(
        "RECOVERY_SCOPE_INVALID",
        "Wallet authorization changed during check",
      );
    const built = buildSettlementRequest(
      { ...target, validUntil: terms.validUntil },
      input,
      nowSeconds,
    );
    if (this.#issued.has(built.requestId))
      throw new WalletError("DUPLICATE_REQUEST", "Request already signed");
    const signature = await this.backend.signTypedData(
      built.domain,
      SETTLEMENT_REQUEST_TYPES,
      built.message,
    );
    this.#issued.add(built.requestId);
    await this.audit("readHistoricalOrder", "ok", {
      requestId: built.requestId,
    });
    return {
      version: "agentpay.settlement-request.v1",
      requestId: built.requestId,
      request: built.message,
      signature,
    };
  }

  async signSettlementRequest(
    input: unknown,
    nowSeconds = Math.floor(Date.now() / 1000),
  ) {
    this.#assertNotMigrating();
    if (!this.#policy)
      throw new WalletError(
        "POLICY_UNBOUND",
        "session key is not bound to a policy",
      );
    const built = buildSettlementRequest(this.#policy, input, nowSeconds);
    if (this.#issued.has(built.requestId))
      throw new WalletError(
        "DUPLICATE_REQUEST",
        "request was already signed locally",
      );
    const signature = await this.backend.signTypedData(
      built.domain,
      SETTLEMENT_REQUEST_TYPES,
      built.message,
    );
    this.#issued.add(built.requestId);
    await this.audit("signSettlementRequest", "ok", {
      requestId: built.requestId,
      action: built.message.action,
    });
    return {
      version: "agentpay.settlement-request.v1",
      requestId: built.requestId,
      request: built.message,
      signature,
    };
  }

  async destroy(reason: string, confirmAddress: string): Promise<void> {
    if (typeof reason !== "string" || reason.trim().length < 3) {
      throw new WalletError(
        "DESTROY_REASON_REQUIRED",
        "destroy requires a reason",
      );
    }
    const currentAddress = await this.backend.address();
    if (confirmAddress.toLowerCase() !== currentAddress.toLowerCase()) {
      throw new WalletError(
        "DESTROY_CONFIRMATION_FAILED",
        "destroy confirmation address does not match",
      );
    }
    const address = await this.backend.destroy();
    await atomicWritePrivate(
      join(this.dataDir, "tombstone.json"),
      JSON.stringify(
        {
          address,
          policyId: this.#policy?.policyId ?? null,
          recoveryScope: this.#policy
            ? {
                network: `eip155:${this.#policy.chainId}`,
                module: this.#policy.module,
                safe: this.#policy.safe,
                policyId: this.#policy.policyId,
              }
            : null,
          destroyedAtMs: assertUnixMilliseconds(Date.now()),
          reason: reason.trim(),
        },
        null,
        2,
      ),
    );
    await this.audit("destroy", "ok", {
      address,
      policyId: this.#policy?.policyId ?? null,
    });
  }

  /** Supply only reviewed public metadata; callers must exclude secrets and signatures. */
  async audit(
    operation: string,
    result: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const path = join(this.dataDir, "audit.jsonl");
    if (await exists(path)) await assertPrivateFile(path);
    await appendFile(
      path,
      `${JSON.stringify({ ...metadata, operation, result, atMs: assertUnixMilliseconds(Date.now()) })}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );
  }
}
