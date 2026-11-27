// L-A1a: staff accounts, sign-in, cookie sessions, 3 roles, break-glass token.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  lte: (col: unknown, value: unknown) => ({ kind: "lte", col, value }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  asc: (c: unknown) => c,
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));
const store = new FakeStore();
vi.mock("@/db", () => ({ getDb: () => store }));
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => null }));

import * as consentRoute from "@/app/api/v1/admin/consent/route";
import * as leadsRoute from "@/app/api/v1/admin/leads/route";
import * as outboxRoute from "@/app/api/v1/admin/outbox/process/route";
import * as policiesRoute from "@/app/api/v1/admin/policies/route";
import * as privacyRoute from "@/app/api/v1/admin/privacy-requests/route";
import { POST as loginPOST } from "@/app/api/v1/admin/auth/login/route";
import { POST as logoutPOST } from "@/app/api/v1/admin/auth/logout/route";
import { GET as meGET } from "@/app/api/v1/admin/auth/me/route";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { PBKDF2_ITERATIONS, hashPassphrase, verifyPassphrase } from "@/lib/api/staff-password";
import { ROUTE_PERMISSIONS, roleHas } from "@/lib/api/staff-permissions";
import { SESSION_COOKIE } from "@/lib/api/staff-session";
import * as createStaff from "../scripts/create-staff.mjs";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;
const ORIGIN = "https://x.test";
const PASS = "correct horse battery staple";
const TOKEN = "b".repeat(48); // test-only

let ip = 0;
const nextIp = () => `10.91.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`;

function req(path: string, init: { method?: string; cookie?: string; origin?: string | null; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Real-IP": nextIp() };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  if (init.cookie) headers.cookie = `${SESSION_COOKIE}=${init.cookie}`;
  if (init.token !== undefined) headers["x-admin-token"] = init.token;
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function addUser(email: string, role: string, extra: Record<string, unknown> = {}) {
  store.tables.staff_users.push({
    id: store.tables.staff_users.length + 1,
    email,
    displayName: email.split("@")[0],
    role,
    // Low iteration count keeps tests fast; verify reads the count from the hash.
    passwordHash: await hashPassphrase(PASS, 1000),
    createdAt: new Date().toISOString(),
    disabledAt: null,
    failedCount: 0,
    lockedUntil: null,
    ...extra,
  });
}

async function signIn(email: string, passphrase = PASS) {
  const res = await loginPOST(req("/api/v1/admin/auth/login", { method: "POST", body: { email, passphrase } }));
  const setCookie = res.headers.get("set-cookie") ?? "";
  const cookie = new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(setCookie)?.[1] ?? "";
  return { res, setCookie, cookie };
}

beforeEach(async () => {
  store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [], consent_events: [], policy_publications: [], privacy_requests: [], staff_users: [], staff_sessions: [] };
  resetRateLimits();
  delete ENV.USAM_ADMIN_TOKEN;
  delete ENV.USAM_LEAD_NOTIFY_WEBHOOK;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-01T08:00:00.000Z"));
  await addUser("owner@example.test", "super_admin");
  await addUser("admin@example.test", "admin");
  await addUser("agent@example.test", "lead_inbox_agent");
});
afterEach(() => vi.useRealTimers());

describe("passphrase hashing", () => {
  it("uses PBKDF2-SHA256 at 600,000 iterations and rejects passphrases under 14 characters", async () => {
    expect(PBKDF2_ITERATIONS).toBe(600_000);
    const h = await hashPassphrase("fourteen chars", 1000);
    expect(h).toMatch(/^pbkdf2-sha256\$1000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verifyPassphrase("fourteen chars", h)).toBe(true);
    expect(await verifyPassphrase("fourteen charz", h)).toBe(false);
    await expect(hashPassphrase("thirteen char")).rejects.toThrow(/14/);
  });

  it("scripts/create-staff.mjs writes the same format, verified by the server code", async () => {
    expect(createStaff.PBKDF2_ITERATIONS).toBe(PBKDF2_ITERATIONS);
    const h = await createStaff.hashPassphrase(PASS, 1000);
    expect(await verifyPassphrase(PASS, h)).toBe(true);
    await expect(createStaff.hashPassphrase("short")).rejects.toThrow(/14/);
  });
});

describe("sign-in", () => {
  it("ok: 200, session cookie flags, user without the hash, only the cookie hash is stored", async () => {
    const { res, setCookie, cookie } = await signIn("Owner@Example.test");
    expect(res.status).toBe(200);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/api/v1/admin");
    expect(setCookie).toContain("Max-Age=28800");
    const body = (await res.json()) as { data: { user: Record<string, unknown> } };
    expect(body.data.user).toMatchObject({ email: "owner@example.test", role: "super_admin" });
    expect(JSON.stringify(body)).not.toContain("pbkdf2");
    expect(store.tables.staff_sessions).toHaveLength(1);
    expect(store.tables.staff_sessions[0].id).not.toBe(cookie);
    expect(String(store.tables.staff_sessions[0].id)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("bad passphrase, unknown email and disabled account: same 401 message", async () => {
    await addUser("gone@example.test", "admin", { disabledAt: new Date().toISOString() });
    const messages = [];
    for (const [email, pass] of [["owner@example.test", "wrong passphrase!!"], ["nobody@example.test", PASS], ["gone@example.test", PASS]]) {
      const { res } = await signIn(email, pass);
      expect(res.status).toBe(401);
      messages.push(((await res.json()) as { error: { message: string } }).error.message);
    }
    expect(new Set(messages).size).toBe(1);
  });

  it("locked: 5 failed sign-ins lock the account for 15 minutes, even with the right passphrase", async () => {
    for (let i = 0; i < 5; i++) expect((await signIn("admin@example.test", "wrong passphrase!!")).res.status).toBe(401);
    const locked = await signIn("admin@example.test");
    expect(locked.res.status).toBe(429);
    expect(Number(locked.res.headers.get("retry-after"))).toBeGreaterThan(14 * 60);
    vi.setSystemTime(new Date(Date.now() + 15 * 60_000 + 1000));
    expect((await signIn("admin@example.test")).res.status).toBe(200);
  });

  it("refuses a sign-in with a missing or foreign Origin (CSRF)", async () => {
    for (const origin of [null, "https://evil.example"]) {
      const res = await loginPOST(req("/api/v1/admin/auth/login", { method: "POST", origin, body: { email: "owner@example.test", passphrase: PASS } }));
      expect(res.status).toBe(403);
    }
  });
});

describe("session lifetime", () => {
  it("me works with the cookie and 401s without it", async () => {
    const { cookie } = await signIn("agent@example.test");
    const ok = await meGET(req("/api/v1/admin/auth/me", { cookie }));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { data: { user: { permissions: string[] } } }).data.user.permissions).toEqual(["leads:view", "leads:assign", "leads:update-status"]);
    expect((await meGET(req("/api/v1/admin/auth/me"))).status).toBe(401);
  });

  it("idle 30 minutes ends the session", async () => {
    const { cookie } = await signIn("owner@example.test");
    vi.setSystemTime(new Date(Date.now() + 29 * 60_000));
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { cookie }))).status).toBe(200);
    vi.setSystemTime(new Date(Date.now() + 31 * 60_000));
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { cookie }))).status).toBe(401);
  });

  it("absolute 8 hours ends the session even when active", async () => {
    const { cookie } = await signIn("owner@example.test");
    for (let i = 0; i < 23; i++) {
      vi.setSystemTime(new Date(Date.now() + 20 * 60_000)); // 23 x 20 min = 7 h 40 min
      expect((await meGET(req("/api/v1/admin/auth/me", { cookie }))).status).toBe(200);
    }
    vi.setSystemTime(new Date(Date.now() + 21 * 60_000)); // past 8 h
    expect((await meGET(req("/api/v1/admin/auth/me", { cookie }))).status).toBe(401);
  });

  it("logout ends the session and clears the cookie; needs a same-site Origin", async () => {
    const { cookie } = await signIn("owner@example.test");
    expect((await logoutPOST(req("/api/v1/admin/auth/logout", { method: "POST", cookie, origin: null }))).status).toBe(403);
    const out = await logoutPOST(req("/api/v1/admin/auth/logout", { method: "POST", cookie }));
    expect(out.status).toBe(200);
    expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await meGET(req("/api/v1/admin/auth/me", { cookie }))).status).toBe(401);
  });

  it("a disabled account loses its open sessions", async () => {
    const { cookie } = await signIn("admin@example.test");
    store.tables.staff_users.find((u) => u.email === "admin@example.test")!.disabledAt = new Date().toISOString();
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { cookie }))).status).toBe(401);
  });
});

type Handler = (r: Request) => Promise<Response>;
const ROUTES: Record<keyof typeof ROUTE_PERMISSIONS, { handler: Handler; body?: unknown }> = {
  "GET /api/v1/admin/leads": { handler: leadsRoute.GET },
  "GET /api/v1/admin/privacy-requests": { handler: privacyRoute.GET },
  "PATCH /api/v1/admin/privacy-requests": { handler: privacyRoute.PATCH, body: { reference: "PRQ-NONE00", assignedTo: "x" } },
  "GET /api/v1/admin/consent": { handler: consentRoute.GET },
  "POST /api/v1/admin/outbox/process": { handler: outboxRoute.POST },
  "GET /api/v1/admin/policies": { handler: policiesRoute.GET },
  "POST /api/v1/admin/policies": { handler: policiesRoute.POST, body: { policyType: "terms", locale: "en", version: "role-test" } },
};

describe("role x route (permission from lib/api/staff-permissions.ts)", () => {
  const roles = [["super_admin", "owner@example.test"], ["admin", "admin@example.test"], ["lead_inbox_agent", "agent@example.test"]] as const;
  for (const [role, email] of roles) {
    for (const key of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      const allowed = roleHas(role, ROUTE_PERMISSIONS[key]);
      it(`${role} ${key} -> ${allowed ? "allowed" : "403"}`, async () => {
        const { cookie } = await signIn(email);
        const [method, path] = key.split(" ");
        const { handler, body } = ROUTES[key];
        const query = path.endsWith("/consent") ? "?ref=USAM-AAAAAA" : path.endsWith("/policies") && method === "GET" ? "?type=terms" : "";
        const res = await handler(req(path + query, { method, cookie, body }));
        if (allowed) expect([401, 403]).not.toContain(res.status);
        else expect(res.status).toBe(403);
      });
    }
  }

  it("matches the fixed list: agent only leads; admin cannot publish policies", () => {
    expect(roleHas("lead_inbox_agent", "leads:view")).toBe(true);
    expect(roleHas("lead_inbox_agent", "privacy_requests:view")).toBe(false);
    expect(roleHas("admin", "policies:publish")).toBe(false);
    expect(roleHas("super_admin", "policies:publish")).toBe(true);
    expect(roleHas("unknown-role", "leads:view")).toBe(false);
  });
});

describe("origin check on admin writes made with a session (CSRF)", () => {
  it("PATCH without Origin or with a foreign Origin -> 403; same Origin passes; GET needs no Origin", async () => {
    const { cookie } = await signIn("owner@example.test");
    const body = { reference: "PRQ-NONE00", assignedTo: "x" };
    expect((await privacyRoute.PATCH(req("/api/v1/admin/privacy-requests", { method: "PATCH", cookie, body, origin: null }))).status).toBe(403);
    expect((await privacyRoute.PATCH(req("/api/v1/admin/privacy-requests", { method: "PATCH", cookie, body, origin: "https://evil.example" }))).status).toBe(403);
    expect((await privacyRoute.PATCH(req("/api/v1/admin/privacy-requests", { method: "PATCH", cookie, body }))).status).toBe(404); // passed auth; no such ref
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { cookie, origin: null }))).status).toBe(200);
  });
});

describe("break-glass x-admin-token (unchanged behaviour)", () => {
  it("still works with no session, for every route", async () => {
    ENV.USAM_ADMIN_TOKEN = TOKEN;
    for (const key of Object.keys(ROUTES) as (keyof typeof ROUTES)[]) {
      const [method, path] = key.split(" ");
      const { handler, body } = ROUTES[key];
      const query = path.endsWith("/consent") ? "?ref=USAM-AAAAAA" : path.endsWith("/policies") && method === "GET" ? "?type=terms" : "";
      const res = await handler(req(path + query, { method, body, token: TOKEN, origin: null }));
      expect([401, 403], key).not.toContain(res.status);
    }
  });

  it("a sent token header is judged alone: wrong token + valid session cookie -> 401", async () => {
    ENV.USAM_ADMIN_TOKEN = TOKEN;
    const { cookie } = await signIn("owner@example.test");
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { cookie, token: "wrong" }))).status).toBe(401);
  });

  it("no session and no token configured -> 403 (fail closed)", async () => {
    expect((await leadsRoute.GET(req("/api/v1/admin/leads"))).status).toBe(403);
  });
});
