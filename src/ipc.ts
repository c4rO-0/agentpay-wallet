/**
 * Local application boundary: newline JSON over a private Unix socket.
 * Authenticate the capability and allowlist the method before invoking Wallet.
 *
 * startWalletServer owns transport; dispatch chooses the capability role;
 * invoke maps allowed methods to bounded Wallet or Settlement operations.
 * callWallet is the public client. It does not retry: a lost response cannot
 * establish whether a signed action already reached the remote service.
 */
import { acquireServiceOwner } from "./service-owner.js";
import { signMarketConnection } from "./market-connection.js";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  createConnection,
  createServer,
  type Server,
  type Socket,
} from "node:net";
import { chmod, readFile, lstat } from "node:fs/promises";
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
  // Acquire before loading mutable journals. A losing starter must neither open
  // a competing coordinator nor unlink the live service's endpoint.
  const owner = await acquireServiceOwner(dataDir);
  let server: Server | undefined;
  const sockets = new Set<Socket>();
  const pending = new Set<Promise<void>>();
  const socketPath = join(dataDir, "wallet.sock");
  try {
    const wallet = await Phase0Wallet.open(dataDir);
    const agentToken = await readToken(join(dataDir, "agent.token"));
    const adminToken = await readToken(join(dataDir, "admin.token"));
    // With ownership held, a leftover Unix socket can only be from a stopped
    // compliant service. Do not delete an arbitrary file or symbolic link.
    try {
      if (!(await lstat(socketPath)).isSocket())
        throw new WalletError(
          "UNSAFE_SOCKET",
          "Wallet socket path is not a socket. Inspect the data directory before retrying.",
        );
      await removeIfPresent(socketPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    server = createServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      socket.on("error", () => socket.destroy());
      socket.setEncoding("utf8");
      socket.setTimeout(10_000, () => socket.destroy());
      let buffered = "";
      let consumed = false;
      socket.on("data", (chunk: string) => {
        if (consumed) return;
        buffered += chunk;
        if (Buffer.byteLength(buffered) > MAX_MESSAGE_BYTES) {
          consumed = true;
          socket.end(
            `${JSON.stringify(failure(null, new WalletError("MESSAGE_TOO_LARGE", "request is too large")))}\n`,
          );
          return;
        }
        const boundary = buffered.indexOf("\n");
        if (boundary === -1) return;
        consumed = true; // Set before any await: exactly one operation per connection.
        socket.setTimeout(0);
        const line = buffered.slice(0, boundary);
        buffered = "";
        const operation = (async () => {
          let response;
          try {
            response = await dispatch(wallet, line, agentToken, adminToken);
          } catch (error) {
            response = failure(null, error);
          }
          if (!socket.destroyed) socket.end(`${JSON.stringify(response)}\n`);
        })().catch(() => {
          socket.destroy();
        });
        pending.add(operation);
        void operation.finally(() => pending.delete(operation));
      });
    });
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(socketPath, resolve);
    });
    await chmod(socketPath, 0o600);
    let closing: Promise<void> | undefined;
    return {
      socketPath,
      close() {
        // Stop accepting first, then drain operations before releasing ownership.
        // Disconnecting a caller does not cancel a signed/forwarded operation.
        return (closing ??= (async () => {
          const stopped = closeServer(server!);
          for (const socket of sockets) socket.destroy();
          await Promise.allSettled([...pending]);
          wallet.backend.lock();
          await stopped;
          await owner.close();
        })());
      },
    };
  } catch (error) {
    if (server?.listening) await closeServer(server);
    await owner.close();
    throw error;
  }
}

export async function callWallet(
  socketPath: string,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
  options: { timeoutMs?: number } = {},
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000)
    throw new WalletError(
      "INVALID_FIELDS",
      "Wallet timeout must be between 1 and 300000 milliseconds.",
    );
  const id = randomBytes(8).toString("hex");
  const request = `${JSON.stringify({ id, token, method, params })}\n`;
  if (Buffer.byteLength(request) > MAX_MESSAGE_BYTES)
    throw new WalletError("MESSAGE_TOO_LARGE", "request is too large");
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let response = "";
    let settled = false;
    const finish = (error?: unknown, result?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish(
          new WalletError(
            "IPC_TIMEOUT",
            "Wallet did not respond in time. The operation may have started; check status and resume the original request. Do not create a replacement purchase.",
          ),
        ),
      timeoutMs,
    );
    socket.setEncoding("utf8");
    socket.once("error", (error) => finish(error));
    socket.on("data", (chunk: string) => {
      response += chunk;
      if (Buffer.byteLength(response) > 8 * 1024 * 1024)
        finish(
          new WalletError(
            "IPC_RESPONSE_TOO_LARGE",
            "Wallet response exceeded the local limit. Keep the original request and contact support.",
          ),
        );
    });
    socket.on("end", () => {
      try {
        const parsed = JSON.parse(response);
        if (
          !isRecord(parsed) ||
          parsed.id !== id ||
          typeof parsed.ok !== "boolean"
        )
          throw new WalletError(
            "IPC_RESPONSE_INVALID",
            "Wallet returned an invalid response. Check the original operation before retrying.",
          );
        if (!parsed.ok) {
          const error = isRecord(parsed.error) ? parsed.error : {};
          throw new WalletError(
            typeof error.code === "string" ? error.code : "IPC_ERROR",
            typeof error.message === "string"
              ? error.message
              : "wallet request failed",
            typeof error.settlementCode === "string"
              ? error.settlementCode
              : undefined,
          );
        }
        finish(undefined, parsed.result);
      } catch (error) {
        finish(error);
      }
    });
    socket.once("close", () => {
      if (!settled)
        finish(
          new WalletError(
            "IPC_CLOSED",
            "Wallet disconnected before confirming the result. Check status and the original request before retrying.",
          ),
        );
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
    const request: unknown = JSON.parse(line);
    if (!isRecord(request))
      throw new WalletError(
        "INVALID_REQUEST",
        "Wallet request must be an object.",
      );
    id = typeof request.id === "string" ? request.id : null;
    if (
      typeof request.token !== "string" ||
      typeof request.method !== "string"
    ) {
      throw new WalletError("INVALID_REQUEST", "token and method are required");
    }
    // Audit only known method names, never arbitrary unauthenticated input.
    operation =
      AGENT_METHODS.has(request.method) || ADMIN_METHODS.has(request.method)
        ? request.method
        : "invalidRequest";
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
    // Only the dispatch table selects actions; a caller cannot pass arbitrary
    // typed data through a financial method or promote an Agent token to admin.
    const result = await invoke(wallet, request.method, params);
    return { id, ok: true, result };
  } catch (error) {
    try {
      await wallet.audit(operation, "rejected", {
        code: publicError(error).code,
      });
    } catch {
      return failure(
        id,
        new WalletError(
          "AUDIT_UNAVAILABLE",
          "Wallet could not save its audit record. Check local storage and service logs; the operation may have partially completed. Keep the original request.",
        ),
      );
    }
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
