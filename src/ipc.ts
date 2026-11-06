/**
 * Local application boundary: newline JSON over a private Unix socket.
 * Authenticate the capability and allowlist the method before invoking Wallet.
 */
import { signMarketConnection } from "./market-connection.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { createConnection, createServer, type Server } from "node:net";
import { chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { WalletError, publicError } from "./errors.js";
import {
  assertPrivateFile,
  atomicWritePrivate,
  ensurePrivateDirectory,
  exists,
  removeIfPresent,
} from "./files.js";
import { Phase0Wallet } from "./wallet.js";
import { callSettlementWalletApi } from "./settlement-http.js";

const MAX_MESSAGE_BYTES = 64 * 1024;
const AGENT_METHODS = new Set([
  "status",
  "getAddress",
  "signAgentPayCommitment",
  "pollSettlementNotices",
  "acknowledgeSettlementNotice",
  "confirmSettlementDelivery",
  "openSettlementDispute",
  "createSettlementCaseAccess",
  "readSettlementCase",
  "requestSettlementResult",
  "prepareSettlementOrder",
  "readSettlementOrder",
  "cancelSettlementOrder",
  "requestSettlementServiceReady",
]);
// Admin is a separate role, not an automatic superset of Agent financial operations.
const ADMIN_METHODS = new Set([
  "status",
  "getAddress",
  "bindPolicy",
  "unlock",
  "lock",
  "destroy",
  "renewPolicy",
  "previewPolicyRestore",
  "restorePolicy",
  "previewPolicyMigration",
  "preparePolicyMigration",
  "policyMigrationStatus",
  "completePolicyMigration",
  "cancelPolicyMigration",
  "previewPolicyMigrationRefresh",
  "refreshPolicyMigration",
  "marketConnectionScope",
  "signMarketConnection",
]);

export interface WalletServerHandle {
  socketPath: string;
  close(): Promise<void>;
}

export async function initializeCapabilities(dataDir: string): Promise<void> {
  await ensurePrivateDirectory(dataDir);
  for (const name of ["agent.token", "admin.token"]) {
    const path = join(dataDir, name);
    if (!(await exists(path)))
      await atomicWritePrivate(path, `${randomBytes(32).toString("hex")}\n`);
  }
}

export async function startWalletServer(
  dataDir: string,
): Promise<WalletServerHandle> {
  const wallet = await Phase0Wallet.open(dataDir);
  const socketPath = join(dataDir, "wallet.sock");
  const agentToken = await readToken(join(dataDir, "agent.token"));
  const adminToken = await readToken(join(dataDir, "admin.token"));
  await removeIfPresent(socketPath);

  const server = createServer((socket) => {
    socket.setEncoding("utf8");
    let buffered = "";
    socket.on("data", (chunk: string) => {
      buffered += chunk;
      if (Buffer.byteLength(buffered) > MAX_MESSAGE_BYTES) {
        socket.end(
          `${JSON.stringify(failure(null, new WalletError("MESSAGE_TOO_LARGE", "request is too large")))}\n`,
        );
        return;
      }
      const boundary = buffered.indexOf("\n");
      if (boundary === -1) return;
      const line = buffered.slice(0, boundary);
      buffered = "";
      void dispatch(wallet, line, agentToken, adminToken).then((response) => {
        socket.end(`${JSON.stringify(response)}\n`);
      });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  await chmod(socketPath, 0o600);
  return {
    socketPath,
    async close() {
      await closeServer(server);
      await removeIfPresent(socketPath);
    },
  };
}

export async function callWallet(
  socketPath: string,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const request = `${JSON.stringify({ id: randomBytes(8).toString("hex"), token, method, params })}\n`;
  if (Buffer.byteLength(request) > MAX_MESSAGE_BYTES)
    throw new WalletError("MESSAGE_TOO_LARGE", "request is too large");
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = "";
    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.on("data", (chunk: string) => {
      response += chunk;
    });
    socket.on("end", () => {
      try {
        const parsed = JSON.parse(response) as {
          ok: boolean;
          result?: unknown;
          error?: { code: string; message: string; settlementCode?: string };
        };
        if (!parsed.ok)
          throw new WalletError(
            parsed.error?.code ?? "IPC_ERROR",
            parsed.error?.message ?? "wallet request failed",
            parsed.error?.settlementCode,
          );
        resolve(parsed.result);
      } catch (error) {
        reject(error);
      }
    });
    socket.write(request);
  });
}

export async function readCapability(
  dataDir: string,
  role: "agent" | "admin",
): Promise<string> {
  return readToken(join(dataDir, `${role}.token`));
}

async function dispatch(
  wallet: Phase0Wallet,
  line: string,
  agentToken: string,
  adminToken: string,
) {
  let id: unknown = null;
  let operation = "invalidRequest";
  try {
    const request = JSON.parse(line) as Record<string, unknown>;
    id = request.id ?? null;
    if (
      typeof request.token !== "string" ||
      typeof request.method !== "string"
    ) {
      throw new WalletError("INVALID_REQUEST", "token and method are required");
    }
    operation = request.method;
    const role = tokenEqual(request.token, adminToken)
      ? "admin"
      : tokenEqual(request.token, agentToken)
        ? "agent"
        : null;
    if (!role)
      throw new WalletError("UNAUTHORIZED", "invalid wallet capability");
    const allowed = role === "admin" ? ADMIN_METHODS : AGENT_METHODS;
    if (!allowed.has(request.method))
      throw new WalletError(
        "METHOD_NOT_ALLOWED",
        "method is not allowed for this capability",
      );
    const params = isRecord(request.params) ? request.params : {};
    const result = await invoke(wallet, request.method, params);
    return { id, ok: true, result };
  } catch (error) {
    await wallet.audit(operation, "rejected", {
      code: publicError(error).code,
    });
    return failure(id, error);
  }
}

async function invoke(
  wallet: Phase0Wallet,
  method: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (method) {
    case "status":
      return wallet.status();
    case "getAddress":
      return { address: await wallet.address() };
    case "marketConnectionScope":
      return wallet.marketConnectionScope();
    case "signMarketConnection":
      return signMarketConnection(wallet, params);
    case "previewPolicyRestore":
      return wallet.previewPolicyRestore(params.target);
    case "renewPolicy":
      return wallet.renewPolicy(params);
    case "restorePolicy":
      return wallet.restorePolicy(params.target);
    case "bindPolicy":
      return wallet.bindPolicy(params.policy);
    case "previewPolicyMigration":
      return wallet.previewPolicyMigration(params.target);
    case "preparePolicyMigration":
      return wallet.preparePolicyMigration(
        params.target,
        requiredString(params.migrationId, "migrationId"),
      );
    case "policyMigrationStatus":
      return wallet.policyMigrationStatus();
    case "previewPolicyMigrationRefresh":
      return wallet.previewPolicyMigrationRefresh();
    case "refreshPolicyMigration":
      return wallet.refreshPolicyMigration(
        requiredString(params.previousMigrationId, "previousMigrationId"),
        requiredString(params.migrationId, "migrationId"),
      );
    case "completePolicyMigration":
      return wallet.completePolicyMigration(
        requiredString(params.migrationId, "migrationId"),
      );
    case "cancelPolicyMigration":
      return wallet.cancelPolicyMigration(
        requiredString(params.migrationId, "migrationId"),
      );
    case "unlock":
      return wallet.unlock(requiredString(params.password, "password"));
    case "lock":
      await wallet.lock();
      return { locked: true };
    case "destroy":
      await wallet.destroy(
        requiredString(params.reason, "reason"),
        requiredString(params.confirmAddress, "confirmAddress"),
      );
      return { destroyed: true };
    case "signAgentPayCommitment":
      return wallet.signAgentPayCommitment(params.commitment);
    case "pollSettlementNotices":
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "notices.list",
        { limit: params.limit },
      );
    case "acknowledgeSettlementNotice":
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "notices.acknowledge",
        { noticeId: requiredString(params.noticeId, "noticeId") },
      );
    case "confirmSettlementDelivery":
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "delivery.confirm",
        { orderId: requiredString(params.orderId, "orderId") },
      );
    case "openSettlementDispute":
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "dispute.open",
        {
          orderId: requiredString(params.orderId, "orderId"),
          reasonHash: requiredString(params.reasonHash, "reasonHash"),
        },
      );
    case "createSettlementCaseAccess":
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "dispute.access",
        { orderId: requiredString(params.orderId, "orderId") },
      );
    case "readSettlementCase":
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "dispute.read",
        { orderId: requiredString(params.orderId, "orderId") },
      );
    case "requestSettlementResult":
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "dispute.result",
        {
          orderId: requiredString(params.orderId, "orderId"),
          operationId: requiredString(params.operationId, "operationId"),
        },
      );
    case "prepareSettlementOrder":
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "order.prepare",
        {
          orderRequestId: requiredString(
            params.orderRequestId,
            "orderRequestId",
          ),
          skillId: requiredString(params.skillId, "skillId"),
          profileHash: requiredString(params.profileHash, "profileHash"),
          ...(params.offerId == null
            ? {}
            : { offerId: requiredString(params.offerId, "offerId") }),
          ...(params.acceptedTerms == null
            ? {}
            : { acceptedTerms: params.acceptedTerms }),
          requestHash: requiredString(params.requestHash, "requestHash"),
          requestedMaxUsageUnits: requiredString(
            params.requestedMaxUsageUnits,
            "requestedMaxUsageUnits",
          ),
        },
        Math.floor(Date.now() / 1000),
        30000,
        undefined,
        params.expectedScope,
      );
    case "cancelSettlementOrder": {
      if (
        Object.keys(params).sort().join(",") !==
        "cancellationId,orderId,settlementUrl"
      )
        throw new WalletError(
          "INVALID_FIELDS",
          "cancellation requires settlementUrl, orderId and cancellationId only",
        );
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "order.cancel",
        {
          orderId: requiredString(params.orderId, "orderId"),
          cancellationId: requiredString(
            params.cancellationId,
            "cancellationId",
          ),
        },
      );
    }
    case "readSettlementOrder": {
      if (
        Object.keys(params).some(
          (k) =>
            ![
              "settlementUrl",
              "orderId",
              "orderRequestId",
              "recoveryScope",
            ].includes(k),
        ) ||
        (params.orderId === undefined) === (params.orderRequestId === undefined)
      )
        throw new WalletError(
          "INVALID_FIELDS",
          "Choose one original Order or request",
        );
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "order.read",
        params.orderId !== undefined
          ? { orderId: requiredString(params.orderId, "orderId") }
          : {
              orderRequestId: requiredString(
                params.orderRequestId,
                "orderRequestId",
              ),
            },
        Math.floor(Date.now() / 1000),
        30000,
        params.recoveryScope,
      );
    }
    case "requestSettlementServiceReady":
      return callSettlementWalletApi(
        wallet,
        requiredString(params.settlementUrl, "settlementUrl"),
        "service.ready",
        {
          orderId: requiredString(params.orderId, "orderId"),
          requestHash: requiredString(params.requestHash, "requestHash"),
        },
      );
    default:
      throw new WalletError(
        "METHOD_NOT_ALLOWED",
        "wallet method is not supported",
      );
  }
}

function failure(id: unknown, error: unknown) {
  return { id, ok: false, error: publicError(error) };
}

function tokenEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readToken(path: string): Promise<string> {
  await assertPrivateFile(path);
  const token = (await readFile(path, "utf8")).trim();
  if (!/^[0-9a-f]{64}$/.test(token))
    throw new WalletError(
      "INVALID_CAPABILITY",
      "wallet capability file is invalid",
    );
  return token;
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string")
    throw new WalletError("INVALID_REQUEST", `${name} is required`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
