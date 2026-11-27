// L-A0: every admin route handler under app/api/v1/admin, against every token
// case, plus a folder scan so a new admin route without authorizeAdmin fails.
//
// Cases per handler:
//   no token, USAM_ADMIN_TOKEN unset  -> 403 (fail closed)
//   no token, token set               -> 401
//   wrong token                       -> 401
//   right token                       -> 2xx
//   denied responses carry only { error: { code, message, retryable, requestId } }
//   and never the seeded personal data.
// Each request has its own X-Real-IP, so the PR #7 rate limiter never interferes.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
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
import { createLead } from "@/lib/api/leads";
import { createPrivacyRequest } from "@/lib/api/privacy-requests";
import { resetRateLimits } from "@/lib/api/rate-limit";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;
const original = { token: ENV.USAM_ADMIN_TOKEN, hook: ENV.USAM_LEAD_NOTIFY_WEBHOOK, mail: ENV.USAM_LEAD_NOTIFY_EMAIL };
const TOKEN = "t".repeat(48); // test-only value, not a real secret
const SECRET_EMAIL = "matrix.private@example.org";
const SECRET_NAME = "Matrix Private Person";

let ip = 0;
const nextIp = () => `10.90.${Math.floor(++ip / 250)}.${(ip % 250) + 1}`;

type Handler = (request: Request) => Promise<Response>;
type Case = {
  route: string; // folder under app/api/v1/admin
  method: "GET" | "POST" | "PATCH";
  handler: Handler;
  url?: string;
  body?: () => unknown; // built at request time (PATCH needs the seeded reference)
};

let prqRef = "";
const CASES: Case[] = [
  { route: "consent", method: "GET", handler: consentRoute.GET, url: "/api/v1/admin/consent?ref=USAM-AAAAAA" },
  { route: "leads", method: "GET", handler: leadsRoute.GET },
  { route: "outbox/process", method: "POST", handler: outboxRoute.POST },
  { route: "policies", method: "GET", handler: policiesRoute.GET, url: "/api/v1/admin/policies?type=terms" },
  {
    route: "policies",
    method: "POST",
    handler: policiesRoute.POST,
    body: () => ({ policyType: "terms", locale: "en", version: `matrix-${ip}` }),
  },
  { route: "privacy-requests", method: "GET", handler: privacyRoute.GET },
  {
    route: "privacy-requests",
    method: "PATCH",
    handler: privacyRoute.PATCH,
    body: () => ({ reference: prqRef, assignedTo: "staff-a" }),
  },
];

function req(c: Case, token?: string): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Real-IP": nextIp() };
  if (token !== undefined) headers["x-admin-token"] = token;
  return new Request(`https://x.test${c.url ?? `/api/v1/admin/${c.route}`}`, {
    method: c.method,
    headers,
    body: c.body ? JSON.stringify(c.body()) : undefined,
  });
}

async function expectDeniedBody(res: Response) {
  const text = await res.text();
  expect(text).not.toContain(SECRET_EMAIL);
  expect(text).not.toContain(SECRET_NAME);
  const json = JSON.parse(text) as Record<string, unknown>;
  expect(Object.keys(json)).toEqual(["error"]);
  expect(Object.keys(json.error as object).sort()).toEqual(["code", "message", "requestId", "retryable"]);
}

async function seed() {
  store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [], consent_events: [], policy_publications: [], privacy_requests: [] };
  const lead = await createLead({
    input: { name: SECRET_NAME, email: SECRET_EMAIL, kind: "general", locale: "en", message: "A private enquiry for the matrix test.", marketingOptIn: false },
  });
  if (!lead.ok) throw new Error("seed lead failed");
  const prq = await createPrivacyRequest({ input: { requestType: "access", name: SECRET_NAME, email: SECRET_EMAIL, locale: "en" } });
  if (!prq.ok) throw new Error("seed privacy request failed");
  prqRef = prq.body.reference;
}

beforeEach(async () => {
  resetRateLimits();
  delete ENV.USAM_LEAD_NOTIFY_WEBHOOK; // outbox process stays in its "disabled" 200 path
  delete ENV.USAM_LEAD_NOTIFY_EMAIL;
  await seed();
});
afterAll(() => {
  for (const [k, v] of [["USAM_ADMIN_TOKEN", original.token], ["USAM_LEAD_NOTIFY_WEBHOOK", original.hook], ["USAM_LEAD_NOTIFY_EMAIL", original.mail]] as const) {
    if (v === undefined) delete ENV[k];
    else ENV[k] = v;
  }
});

describe.each(CASES)("$method /api/v1/admin/$route", (c) => {
  it("no token and USAM_ADMIN_TOKEN unset -> 403, no data", async () => {
    delete ENV.USAM_ADMIN_TOKEN;
    const res = await c.handler(req(c));
    expect(res.status).toBe(403);
    await expectDeniedBody(res);
  });

  it("no token, USAM_ADMIN_TOKEN set -> 401, no data", async () => {
    ENV.USAM_ADMIN_TOKEN = TOKEN;
    const res = await c.handler(req(c));
    expect(res.status).toBe(401);
    await expectDeniedBody(res);
  });

  it("wrong token -> 401, no data", async () => {
    ENV.USAM_ADMIN_TOKEN = TOKEN;
    for (const wrong of ["wrong", TOKEN.slice(0, -1), `${TOKEN}x`, ""]) {
      const res = await c.handler(req(c, wrong));
      expect(res.status, `token "${wrong.slice(0, 6)}…"`).toBe(401);
      await expectDeniedBody(res);
    }
  });

  it("right token -> 2xx", async () => {
    ENV.USAM_ADMIN_TOKEN = TOKEN;
    const res = await c.handler(req(c, TOKEN));
    expect(res.status, await res.clone().text()).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });
});

it("right token on GET leads really returns the seeded data (so the 'no data' checks mean something)", async () => {
  ENV.USAM_ADMIN_TOKEN = TOKEN;
  const res = await leadsRoute.GET(req(CASES[1], TOKEN));
  expect(await res.text()).toContain(SECRET_EMAIL);
});

// ---- folder scan: a new admin route must be gated and listed above ----------

const ADMIN_DIR = path.resolve(__dirname, "../app/api/v1/admin");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return /^route\.(ts|tsx|js|mjs)$/.test(name) ? [full] : [];
  });
}

// The staff sign-in routes (L-A1a) are the way IN, so they cannot require an
// existing session or token. They are listed here by name only and are tested
// in test/staff-auth.test.ts. The MFA routes (L-A1b) check the session stage
// themselves and are tested in test/staff-mfa.test.ts. Any other route must
// pass the scan below.
const AUTH_ROUTES = [
  "auth/login",
  "auth/login/mfa",
  "auth/logout",
  "auth/me",
  "auth/mfa/backup-codes",
  "auth/mfa/setup",
  "auth/mfa/step-up",
  "auth/mfa/verify",
];

describe("admin folder scan", () => {
  const all = routeFiles(ADMIN_DIR);
  const files = all.filter((f) => !AUTH_ROUTES.includes(path.relative(ADMIN_DIR, path.dirname(f))));

  it("finds the admin route files", () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it("the exempt sign-in routes exist and are exactly the listed ones", () => {
    const exempt = all.map((f) => path.relative(ADMIN_DIR, path.dirname(f))).filter((r) => r.startsWith("auth/"));
    expect(exempt.sort()).toEqual([...AUTH_ROUTES].sort());
  });

  it.each(files.map((f) => [path.relative(ADMIN_DIR, path.dirname(f)), f]))(
    "%s: every exported handler calls authorizeAdmin first and is covered by the matrix",
    (route, file) => {
      const src = readFileSync(file, "utf8");
      // Only `export async function METHOD(request...)` is allowed, so it can be checked.
      for (const m of METHODS) {
        expect(src, `${route}: use "export async function ${m}"`).not.toMatch(new RegExp(`export\\s+(const|let|var)\\s+${m}\\b`));
        expect(src, `${route}: re-exported ${m}`).not.toMatch(new RegExp(`export\\s*\\{[^}]*\\b${m}\\b`));
      }
      for (const m of METHODS) {
        expect(src, `${route}: use "export async function ${m}"`).not.toMatch(new RegExp(`export\\s+function\\s+${m}\\b`));
      }
      const chunks = src.split(/(?=export\s+async\s+function\s+)/).filter((c) => /^export\s+async\s+function\s+/.test(c));
      const handlers = chunks
        .map((chunk) => ({ chunk, name: /export\s+async\s+function\s+(\w+)/.exec(chunk)?.[1] ?? "" }))
        .filter((h) => METHODS.includes(h.name));
      expect(handlers.length, `${route}: no handler found`).toBeGreaterThan(0);
      for (const h of handlers) {
        // The gate must come before any other work in the handler body.
        const body = h.chunk.slice(h.chunk.indexOf("{") + 1);
        const firstStatements = body.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//")).slice(0, 3).join("\n");
        expect(firstStatements, `${route} ${h.name}: authorizeAdmin must be called first`).toMatch(/authorizeAdmin\(request,/);
        expect(firstStatements, `${route} ${h.name}: denied result must be returned`).toMatch(/if \(denied\) return denied;/);
        expect(
          CASES.some((c) => c.route === route && c.method === h.name),
          `${route} ${h.name}: add it to CASES in this test`,
        ).toBe(true);
      }
    },
  );
});
