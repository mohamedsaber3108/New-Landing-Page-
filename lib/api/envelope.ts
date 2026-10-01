// Shared response/error envelope for the USAM v1 API (handoff section 13).
//
// Success reads:   { data, meta: { requestId, nextCursor? } }
// Created/accepted: same shape, with the appropriate HTTP status.
// Errors:          { error: { code, message, fieldErrors?, retryable, requestId } }
//
// These helpers guarantee every v1 route speaks the same contract and never
// leaks stack traces, tokens, or database internals.

export type Meta = {
  requestId: string;
  nextCursor?: string;
};

export type FieldErrors = Record<string, string[]>;

export type ApiErrorCode =
  | "bad_request"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "rate_limited"
  | "dependency_unavailable"
  | "internal_error";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  dependency_unavailable: 503,
  internal_error: 500,
};

/** Generate a request id. Uses crypto.randomUUID (available in Workers runtime). */
export function newRequestId(): string {
  return `req_${cryptoRandomId(24)}`;
}

/** URL-safe random id of roughly `bytes` entropy, hex-encoded. */
export function cryptoRandomId(bytes = 16): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Human-shareable lead reference, e.g. "USAM-7F3K2Q". Uses an unambiguous
 * alphabet (no 0/O/1/I) so it can be read aloud or typed back.
 */
export function newReference(prefix = "USAM"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(6);
  crypto.getRandomValues(buf);
  let out = "";
  for (const b of buf) out += alphabet[b % alphabet.length];
  return `${prefix}-${out}`;
}

export type SuccessInit = {
  status?: number;
  requestId: string;
  nextCursor?: string;
  headers?: Record<string, string>;
};

/** Build a success response with the standard `{ data, meta }` envelope. */
export function ok<T>(data: T, init: SuccessInit): Response {
  const meta: Meta = { requestId: init.requestId };
  if (init.nextCursor) meta.nextCursor = init.nextCursor;
  return Response.json(
    { data, meta },
    { status: init.status ?? 200, headers: init.headers },
  );
}

export type ErrorInit = {
  code: ApiErrorCode;
  message: string;
  requestId: string;
  fieldErrors?: FieldErrors;
  retryable?: boolean;
  headers?: Record<string, string>;
};

/** Build an error response with the standard `{ error }` envelope. */
export function fail(init: ErrorInit): Response {
  const retryable =
    init.retryable ?? (init.code === "dependency_unavailable" || init.code === "rate_limited");
  return Response.json(
    {
      error: {
        code: init.code,
        message: init.message,
        ...(init.fieldErrors ? { fieldErrors: init.fieldErrors } : {}),
        retryable,
        requestId: init.requestId,
      },
    },
    { status: STATUS_BY_CODE[init.code], headers: init.headers },
  );
}

/**
 * Map an unknown thrown error to a safe public message + code, hiding internals.
 * The `missingTable` hint lets a route explain how to run migrations.
 */
export function classifyError(
  error: unknown,
  opts: { missingTableHints?: string[] } = {},
): { code: ApiErrorCode; message: string } {
  const message = error instanceof Error ? error.message : "Unexpected error";
  const detail =
    error instanceof Error && error.cause instanceof Error ? error.cause.message : "";
  const combined = `${message}\n${detail}`;

  if (combined.includes("`DB` is unavailable")) {
    return {
      code: "dependency_unavailable",
      message:
        "Database binding `DB` is not configured. Set `d1` to `DB` in .openai/hosting.json and rebuild.",
    };
  }
  if (
    combined.includes("no such table") ||
    (opts.missingTableHints ?? []).some((t) => combined.includes(t))
  ) {
    return {
      code: "dependency_unavailable",
      message:
        "A required table is unavailable. Run `npm run db:generate` and apply the migration to the D1 database.",
    };
  }
  return { code: "internal_error", message: "An unexpected error occurred." };
}
