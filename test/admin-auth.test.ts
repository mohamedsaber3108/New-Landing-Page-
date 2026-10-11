import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminConfigured, authorizeAdmin } from "@/lib/api/admin-auth";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;
const original = ENV.USAM_ADMIN_TOKEN;

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x.test/api/v1/admin/leads", { headers });
}

describe("authorizeAdmin (fail-closed admin gate)", () => {
  beforeEach(() => { delete ENV.USAM_ADMIN_TOKEN; });
  afterEach(() => { if (original === undefined) delete ENV.USAM_ADMIN_TOKEN; else ENV.USAM_ADMIN_TOKEN = original; });

  it("FAILS CLOSED when no token is configured (403), even with a header", async () => {
    expect(adminConfigured()).toBe(false);
    const res = authorizeAdmin(req({ "x-admin-token": "anything" }), "r");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(403);
  });

  it("rejects a missing token with 401 when configured", async () => {
    ENV.USAM_ADMIN_TOKEN = "secret-token";
    const res = authorizeAdmin(req(), "r");
    expect(res!.status).toBe(401);
  });

  it("rejects a wrong token with 401", async () => {
    ENV.USAM_ADMIN_TOKEN = "secret-token";
    const res = authorizeAdmin(req({ "x-admin-token": "nope" }), "r");
    expect(res!.status).toBe(401);
  });

  it("authorizes a correct token (returns null = proceed)", async () => {
    ENV.USAM_ADMIN_TOKEN = "secret-token";
    const res = authorizeAdmin(req({ "x-admin-token": "secret-token" }), "r");
    expect(res).toBeNull();
  });
});
