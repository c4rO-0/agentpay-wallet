/**
 * Public Settlement API adapter only. Normalize signed payloads and bind
 * replies to the requested identity; no private server implementation belongs here.
 */
import {
  normalizeDisputeCase,
  normalizeParticipantOrder,
  normalizeFinalizationDisclosure,
  normalizeOrderDeadlines,
  normalizeServiceAuthorization,
  normalizeDeliveryResult,
  normalizeWalletNotice,
  validateOrderWaiting,
  validateOrderClosure,
  AGENTPAY_ORDER_V2_MEDIA_TYPE,
  AGENTPAY_FINALIZATION_V2_MEDIA_TYPE,
  AGENTPAY_DEADLINES_V2_MEDIA_TYPE,
  AGENTPAY_AUTHORIZATION_V2_MEDIA_TYPE,
  AGENTPAY_DELIVERY_V2_MEDIA_TYPE,
  AGENTPAY_NOTICE_V2_MEDIA_TYPE,
} from "@c4roa0/agentpay-protocol";
import { randomBytes } from "node:crypto";
import { keccak256, toUtf8Bytes } from "ethers";
import { WalletError } from "./errors.js";
import type { Phase0Wallet } from "./wallet.js";
import type { SettlementRequestAction } from "./settlement-request.js";

// Only reviewed Settlement domain codes become stable Wallet/Agent codes.
// Unknown valid codes stay visible as provenance under the default code.
const SETTLEMENT_ERROR_MAP: Readonly<Record<string, string>> = Object.freeze({
  QUOTE_TERMS_CHANGED: "QUOTE_TERMS_CHANGED",
  SERVICE_DURATION_INVALID: "SERVICE_DURATION_INVALID",
  POLICY_SERVICE_WINDOW_TOO_SHORT: "POLICY_SERVICE_WINDOW_TOO_SHORT",
  POLICY_PROFILE_MISMATCH: "POLICY_PROFILE_MISMATCH",
  PROVIDER_RESTRICTED: "PROVIDER_RESTRICTED",
  SERVICE_RESTRICTED: "SERVICE_RESTRICTED",
  BUYER_RESTRICTED: "BUYER_RESTRICTED",
  RESTRICTION_STATE_UNAVAILABLE: "RESTRICTION_STATE_UNAVAILABLE",
  NEW_ORDERS_PAUSED: "NEW_ORDERS_PAUSED",
  ORDER_ALREADY_ACCEPTED: "ORDER_ALREADY_ACCEPTED",
  ORDER_CANCEL_FORBIDDEN: "ORDER_CANCEL_FORBIDDEN",
  ORDER_CANCEL_CONFLICT: "ORDER_CANCEL_CONFLICT",
  ORDER_CLOSING: "ORDER_CLOSING",
  ORDER_CANCELLATION_UNAVAILABLE: "ORDER_CANCELLATION_UNAVAILABLE",
});
const SETTLEMENT_CODE = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

export function normalizeWalletActionPayload(
  action: SettlementRequestAction,
  input: unknown,
): Record<string, unknown> {
  const value =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  if (action === "order.cancel") {
    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(value).sort().join(",") !== "cancellationId,orderId"
    )
      throw new WalletError(
        "INVALID_FIELDS",
        "cancellation requires only orderId and cancellationId",
      );
    return {
      orderId: bytes32(value.orderId, "orderId"),
      cancellationId: bytes32(value.cancellationId, "cancellationId"),
    };
  }
  if (action === "notices.list")
    return { limit: Math.max(1, Math.min(100, Number(value.limit) || 50)) };
  if (action === "notices.acknowledge")
    return { noticeId: required(value.noticeId, "noticeId") };
  if (["dispute.read", "dispute.access", "dispute.result"].includes(action))
    return {
      orderId: bytes32(value.orderId, "orderId"),
      ...(action === "dispute.result"
        ? { operationId: bytes32(value.operationId, "operationId") }
        : {}),
    };
  if (action === "delivery.confirm")
    return { orderId: bytes32(value.orderId, "orderId") };
  if (action === "dispute.open")
    return {
      orderId: bytes32(value.orderId, "orderId"),
      reasonHash: bytes32(value.reasonHash, "reasonHash"),
    };
  if (action === "service.ready")
    return {
      orderId: bytes32(value.orderId, "orderId"),
      requestHash: bytes32(value.requestHash, "requestHash"),
    };
  if (action === "order.prepare")
    return {
      orderRequestId: bytes32(value.orderRequestId, "orderRequestId"),
      skillId: bytes32(value.skillId, "skillId"),
      profileHash: bytes32(value.profileHash, "profileHash"),
      ...(value.offerId == null
        ? {}
        : { offerId: bytes32(value.offerId, "offerId") }),
      ...(value.acceptedTerms == null
        ? {}
        : { acceptedTerms: normalizeAcceptedTerms(value.acceptedTerms) }),
      requestHash: bytes32(value.requestHash, "requestHash"),
      requestedMaxUsageUnits: uint(
        value.requestedMaxUsageUnits,
        "requestedMaxUsageUnits",
      ),
    };
  if (action === "order.read") {
    if (value.orderRequestId !== undefined) {
      if (Object.keys(value).sort().join(",") !== "orderRequestId")
        throw new Error("Use exactly one Order selector");
      return {
        orderRequestId: bytes32(value.orderRequestId, "orderRequestId"),
      };
    }
    if (Object.keys(value).sort().join(",") !== "orderId")
      throw new Error("Use exactly one Order selector");
    return { orderId: bytes32(value.orderId, "orderId") };
  }
  throw new WalletError(
    "INVALID_ACTION",
    "unsupported Settlement request action",
  );
}

/** Property order is part of the signed JSON bytes; do not reorder as style cleanup. */
export function hashWalletActionPayload(
  action: SettlementRequestAction,
  input: unknown,
): string {
  return keccak256(
    toUtf8Bytes(JSON.stringify(normalizeWalletActionPayload(action, input))),
  );
}

export async function callSettlementWalletApi(
  wallet: Phase0Wallet,
  baseUrl: string,
  action: SettlementRequestAction,
  input: unknown = {},
  nowSeconds = Math.floor(Date.now() / 1000),
  timeoutMs = 30_000,
  recoveryScope?: unknown,
  expectedScope?: unknown,
) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new WalletError(
      "INVALID_FIELDS",
      "Settlement HTTP timeout must be positive",
    );
  const endpoint = settlementEndpoint(baseUrl);
  const payload = normalizeWalletActionPayload(action, input);
  if (recoveryScope !== undefined && action !== "order.read")
    throw new WalletError("INVALID_ACTION", "Historical scope is read-only");
  if (expectedScope !== undefined) {
    const expected = expectedScope as Record<string, unknown>,
      current = wallet.marketConnectionScope();
    if (
      !expected ||
      typeof expected !== "object" ||
      Array.isArray(expected) ||
      Object.keys(expected).sort().join(",") !==
        "module,network,policyId,safe" ||
      (["network", "module", "safe", "policyId"] as const).some(
        (k) => String(expected[k]).toLowerCase() !== current[k].toLowerCase(),
      )
    )
      throw new WalletError(
        "RECOVERY_SCOPE_INVALID",
        "Original request authorization differs from current Wallet",
      );
  }
  const request = {
    action,
    payloadHash: hashWalletActionPayload(action, payload),
    requestNonce: `0x${randomBytes(32).toString("hex")}`,
    validBefore: nowSeconds + 60,
  };
  const authorization =
    recoveryScope === undefined
      ? await wallet.signSettlementRequest(request, nowSeconds)
      : await wallet.signHistoricalOrderRead(
          request,
          recoveryScope,
          nowSeconds,
        );
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        accept: `${AGENTPAY_ORDER_V2_MEDIA_TYPE}, ${AGENTPAY_FINALIZATION_V2_MEDIA_TYPE}, ${AGENTPAY_DEADLINES_V2_MEDIA_TYPE}, ${AGENTPAY_AUTHORIZATION_V2_MEDIA_TYPE}, ${AGENTPAY_DELIVERY_V2_MEDIA_TYPE}, ${AGENTPAY_NOTICE_V2_MEDIA_TYPE}`,
      },
      body: JSON.stringify({ authorization, payload }),
    });
    const body = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const failure =
        body?.error && typeof body.error === "object"
          ? (body.error as Record<string, unknown>)
          : {};
      const sourceCode =
        typeof failure.code === "string" && SETTLEMENT_CODE.test(failure.code)
          ? failure.code
          : undefined;
      // Inherited Object members are not reviewed Settlement error codes.
      throw new WalletError(
        sourceCode && Object.hasOwn(SETTLEMENT_ERROR_MAP, sourceCode)
          ? (SETTLEMENT_ERROR_MAP[sourceCode] ?? "SETTLEMENT_REQUEST_REJECTED")
          : "SETTLEMENT_REQUEST_REJECTED",
        String(failure.message || "Settlement rejected request"),
        sourceCode,
      );
    }
    try {
      const raw = body?.result;
      if (
        body?.ok !== true ||
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw)
      )
        throw new Error("invalid result");
      let result = { ...(raw as Record<string, unknown>) };
      if (action === "dispute.read")
        result = normalizeDisputeCase(result) as unknown as Record<
          string,
          unknown
        >;
      if (
        ["dispute.read", "dispute.access", "dispute.result"].includes(action) &&
        result.orderId !== payload.orderId
      )
        throw Error("Case response belongs to another Order");
      if (
        action === "dispute.access" &&
        (typeof result.token !== "string" ||
          result.token.length > 2048 ||
          !Number.isSafeInteger(result.expiresAtMs))
      )
        throw Error("Invalid case access");
      if (action === "order.prepare" || action === "order.read") {
        if (action === "order.read" && payload.orderRequestId !== undefined) {
          if (
            result.orderRequestId !== payload.orderRequestId ||
            typeof result.found !== "boolean"
          )
            throw Error("Invalid request lookup");
          if (!result.found) {
            if (Object.keys(result).sort().join(",") !== "found,orderRequestId")
              throw Error("Unexpected lookup fields");
          }
        }
        if (
          !(
            action === "order.read" &&
            payload.orderRequestId !== undefined &&
            result.found === false
          )
        ) {
          const order = normalizeParticipantOrder(result.order);
          if (order.role !== "buyer") throw new Error("unexpected Order role");
          const boundFields =
            action === "order.read"
              ? payload.orderRequestId !== undefined
                ? []
                : ["orderId"]
              : ["skillId", "profileHash", "requestHash"];
          const fields = order as unknown as Record<string, unknown>;
          if (boundFields.some((field) => fields[field] !== payload[field]))
            throw new Error("Order differs from requested identity");
          result.order = order;
        }
      }
      if (action === "service.ready") {
        result = normalizeServiceAuthorization(result);
        if (
          ["orderId", "requestHash"].some(
            (field) => result[field] !== payload[field],
          )
        )
          throw new Error("Authorization differs from requested identity");
      }
      if (action === "delivery.confirm") {
        result = normalizeDeliveryResult(result);
        if (result.orderId !== payload.orderId)
          throw new Error("Confirmation differs from requested Order");
      }
      if (result.waiting != null)
        result.waiting = validateOrderWaiting(result.waiting);
      if (result.closure != null) {
        result.closure = validateOrderClosure(result.closure);
        if (result.paymentRequired != null)
          throw new Error("Closing Order cannot request payment");
      }
      if (action === "order.cancel") {
        if (
          Object.keys(result).sort().join(",") !==
            "closure,duplicate,orderId" ||
          result.orderId !== payload.orderId ||
          typeof result.duplicate !== "boolean" ||
          !result.closure
        )
          throw new Error(
            "Cancellation response differs from the requested Order",
          );
      }
      let notices: unknown = body.notices;
      if (Object.hasOwn(body, "notices")) {
        if (!Array.isArray(notices) || notices.length > 100)
          throw new Error("invalid notices");
        notices = notices.map(normalizeWalletNotice);
      }
      if (result.deadlines != null)
        result.deadlines = normalizeOrderDeadlines(result.deadlines);
      if (result.disputePolicy != null) {
        const p = result.disputePolicy as Record<string, unknown>,
          times = [
            "submissionMs",
            "evidenceMs",
            "humanMs",
            "decisionMs",
            "releaseMs",
            "refundMs",
          ];
        let previous = 0;
        if (
          p.version !== "agentpay.dispute-policy.v1" ||
          times.some((k) => {
            const v = p[k];
            if (
              typeof v !== "number" ||
              !Number.isSafeInteger(v) ||
              v <= previous
            )
              return true;
            previous = v;
            return false;
          })
        )
          throw Error("Invalid dispute policy");
        const deadlines = result.deadlines as
          | ReturnType<typeof normalizeOrderDeadlines>
          | undefined;
        if (
          !deadlines ||
          deadlines.deliveryDueAtMs === null ||
          deadlines.refundAvailableAtMs - deadlines.deliveryDueAtMs <
            (p.refundMs as number)
        )
          throw Error("Insufficient public refund reserve");
      }
      if (result.finalization != null)
        result.finalization = normalizeFinalizationDisclosure(
          result.finalization,
        );
      return {
        ...body,
        result,
        ...(Object.hasOwn(body, "notices") ? { notices } : {}),
      };
    } catch {
      throw new WalletError(
        "SETTLEMENT_RESPONSE_INVALID",
        "Settlement response has invalid fields or timestamps",
      );
    }
  } catch (error) {
    if (controller.signal.aborted)
      throw new WalletError(
        "SETTLEMENT_TIMEOUT",
        "Settlement HTTP did not complete in time",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function settlementEndpoint(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new WalletError(
      "INVALID_FIELDS",
      "settlementUrl must be an absolute URL",
    );
  }
  const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(
    url.hostname,
  );
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new WalletError(
      "INVALID_FIELDS",
      "Settlement must use HTTPS except on loopback",
    );
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/agentpay/wallet`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new WalletError("INVALID_FIELDS", `${field} is required`);
  return value.trim();
}
function bytes32(value: unknown, field: string): string {
  const result = String(value || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(result))
    throw new WalletError("INVALID_FIELDS", `${field} must be bytes32`);
  return result;
}
function uint(value: unknown, field: string): string {
  const result = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(result))
    throw new WalletError("INVALID_FIELDS", `${field} must be a positive uint`);
  return result;
}

function normalizeAcceptedTerms(input: unknown) {
  const value = input as Record<string, unknown>;
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !==
      "baseAmountAtomic,serviceWindowSeconds,unitPriceAtomic"
  )
    throw Error("Invalid accepted Quote terms");
  const seconds = value.serviceWindowSeconds;
  if (
    typeof seconds !== "number" ||
    !Number.isSafeInteger(seconds) ||
    seconds < 1 ||
    seconds > 31536000
  )
    throw Error("Invalid accepted duration");
  for (const k of ["baseAmountAtomic", "unitPriceAtomic"])
    if (
      typeof value[k] !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(value[k] as string)
    )
      throw Error("Invalid accepted price");
  return {
    baseAmountAtomic: value.baseAmountAtomic as string,
    unitPriceAtomic: value.unitPriceAtomic as string,
    serviceWindowSeconds: seconds,
  };
}
