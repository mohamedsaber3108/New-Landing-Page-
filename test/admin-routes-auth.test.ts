// Proves every NEW admin route actually calls the fail-closed gate — not just
// that the helper works. With no USAM_ADMIN_TOKEN configured, each handler must
// deny (403) regardless of method, so a public admin URL is never usable.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));
vi.mock("@/db", () => ({ getDb: () => new FakeStore() }));
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => null }));

import { GET as policiesGET, POST as policiesPOST } from "@/app/api/v1/admin/policies/route";
import { GET as prGET, PATCH as prPATCH } from "@/app/api/v1/admin/privacy-requests/route";
import { GET as consentGET } from "@/app/api/v1/admin/consent/route";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;
const original = ENV.USAM_ADMIN_TOKEN;

function jsonReq(method: string, body?: unknown): Request {
  return new Request("https://x.test/api/v1/admin/x", {
    method,
    headers: { "Content-Type": "application/json", "x-admin-token": "guessed" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("new admin routes are gated (fail closed with no token)", () => {
  beforeEach(() => { delete ENV.USAM_ADMIN_TOKEN; });
  afterEach(() => { if (original === undefined) delete ENV.USAM_ADMIN_TOKEN; else ENV.USAM_ADMIN_TOKEN = original; });

  it("GET /admin/policies → 403", async () => {
    expect((await policiesGET(jsonReq("GET"))).status).toBe(403);
  });
  it("POST /admin/policies (publish) → 403", async () => {
    const res = await policiesPOST(jsonReq("POST", { policyType: "terms", locale: "en", version: "x" }));
    expect(res.status).toBe(403);
  });
  it("GET /admin/privacy-requests → 403", async () => {
    expect((await prGET(jsonReq("GET"))).status).toBe(403);
  });
  it("PATCH /admin/privacy-requests → 403", async () => {
    const res = await prPATCH(jsonReq("PATCH", { reference: "PRQ-1", status: "completed" }));
    expect(res.status).toBe(403);
  });
  it("GET /admin/consent → 403", async () => {
    expect((await consentGET(jsonReq("GET"))).status).toBe(403);
  });
});
