import { describe, expect, it } from "vitest";
import { classifyError, fail, newReference, newRequestId, ok } from "@/lib/api/envelope";

describe("envelope helpers", () => {
  it("ok() wraps data with meta.requestId and default 200", async () => {
    const res = ok({ hello: "world" }, { requestId: "req_test" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { hello: "world" }, meta: { requestId: "req_test" } });
  });

  it("ok() honors custom status and nextCursor", async () => {
    const res = ok([1, 2], { requestId: "req_x", status: 201, nextCursor: "c2" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { meta: unknown };
    expect(body.meta).toEqual({ requestId: "req_x", nextCursor: "c2" });
  });

  it("fail() maps code -> HTTP status and sets retryable defaults", async () => {
    const res = fail({ code: "validation_failed", message: "bad", requestId: "r" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string; retryable: boolean; requestId: string } };
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.retryable).toBe(false);
    expect(body.error.requestId).toBe("r");
  });

  it("fail() marks dependency_unavailable retryable by default", async () => {
    const res = fail({ code: "dependency_unavailable", message: "down", requestId: "r" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { retryable: boolean } };
    expect(body.error.retryable).toBe(true);
  });

  it("newReference uses an unambiguous alphabet and USAM prefix", () => {
    const ref = newReference();
    expect(ref).toMatch(/^USAM-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    // no ambiguous characters
    expect(ref).not.toMatch(/[OI01]/);
  });

  it("newRequestId is prefixed and unique", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).toMatch(/^req_/);
    expect(a).not.toBe(b);
  });

  it("classifyError hides internals but surfaces missing-binding guidance", () => {
    const binding = classifyError(new Error("Cloudflare D1 binding `DB` is unavailable."));
    expect(binding.code).toBe("dependency_unavailable");
    const generic = classifyError(new Error("secret internal detail"));
    expect(generic.code).toBe("internal_error");
    expect(generic.message).not.toContain("secret internal detail");
  });
});
