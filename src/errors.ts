/**
 * Expected errors expose reviewed codes/messages. Unexpected exceptions
 * are redacted at the IPC boundary rather than leaking stacks or request data.
 */
export class WalletError extends Error {
  readonly code: string;
  readonly settlementCode?: string;

  constructor(code: string, message: string, settlementCode?: string) {
    super(message);
    this.name = "WalletError";
    this.code = code;
    if (settlementCode !== undefined) this.settlementCode = settlementCode;
  }
}

export function publicError(error: unknown): {
  code: string;
  message: string;
  settlementCode?: string;
} {
  if (error instanceof WalletError)
    return {
      code: error.code,
      message: error.message,
      ...(error.settlementCode ? { settlementCode: error.settlementCode } : {}),
    };
  return { code: "INTERNAL_ERROR", message: "wallet operation failed" };
}
