// L-A1b: staff MFA (TOTP + backup codes), required for super_admin and admin,
// step-up for sensitive actions, break-glass token unchanged.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  lt: (col: unknown, value: unknown) => ({ kind: "lt", col, value }),
  lte: (col: unknown, value: unknown) => ({ kind: "lte", col, value }),
  isNull: (col: unknown) => ({ kind: "isNull", col }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  asc: (c: unknown) => c,
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));
const store = new FakeStore();
vi.mock("@/db", () => ({ getDb: () => store }));
vi.mock("@/app/chatgpt-auth", () => ({ getChatGPTUser: async () => null }));

import * as leadsRoute from "@/app/api/v1/admin/leads/route";
import * as policiesRoute from "@/app/api/v1/admin/policies/route";
import { POST as loginPOST } from "@/app/api/v1/admin/auth/login/route";
import { POST as loginMfaPOST } from "@/app/api/v1/admin/auth/login/mfa/route";
import { GET as meGET } from "@/app/api/v1/admin/auth/me/route";
import { POST as backupPOST } from "@/app/api/v1/admin/auth/mfa/backup-codes/route";
import { POST as setupPOST } from "@/app/api/v1/admin/auth/mfa/setup/route";
import { POST as stepUpPOST } from "@/app/api/v1/admin/auth/mfa/step-up/route";
import { POST as verifyPOST } from "@/app/api/v1/admin/auth/mfa/verify/route";
import { resetRateLimits } from "@/lib/api/rate-limit";
import { BAD_CODE } from "@/lib/api/staff-mfa-flow";
import { base32Encode, encryptSecret, otpauthUri, startEnrolment, totp } from "@/lib/api/staff-mfa";
import type { StaffUser } from "@/db/schema";
import { hashPassphrase } from "@/lib/api/staff-password";
import { SESSION_COOKIE } from "@/lib/api/staff-session";

const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;
const ORIGIN = "https://x.test";
const PASS = "correct horse battery staple";
const TOKEN = "c".repeat(48); // test-only
const KEY = "k".repeat(40); // test-only
const OWNER_SECRET = base32Encode(new TextEncoder().encode("owner-secret-20bytes"));

let ipN = 0;
const nextIp = () => `10.92.${Math.floor(++ipN / 250)}.${(ipN % 250) + 1}`;

function req(path: string, init: { method?: string; cookie?: string; body?: unknown; token?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Real-IP": init.ip ?? nextIp(), origin: ORIGIN };
  if (init.cookie) headers.cookie = `${SESSION_COOKIE}=${init.cookie}`;
  if (init.token !== undefined) headers["x-admin-token"] = init.token;
  return new Request(`${ORIGIN}${path}`, {
    method: init.method ?? "POST",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
const cookieOf = (res: Response) => new RegExp(`${SESSION_COOKIE}=([^;]*)`).exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "";
const json = async (res: Response) => (await res.json()) as { data: Record<string, unknown>; error: { message: string; code: string } };
const tick = () => vi.setSystemTime(new Date(Date.now() + 30_000)); // next TOTP step

async function addUser(email: string, role: string, mfaSecret?: string) {
  const id = store.tables.staff_users.length + 1;
  store.tables.staff_users.push({
    id,
    email,
    displayName: email.split("@")[0],
    role,
    passwordHash: await hashPassphrase(PASS, 1000),
    createdAt: new Date().toISOString(),
    disabledAt: null,
    failedCount: 0,
    lockedUntil: null,
    mfaSecretEnc: mfaSecret ? await encryptSecret(mfaSecret, id) : null,
    mfaEnabledAt: mfaSecret ? new Date().toISOString() : null,
    mfaLastStep: 0,
  });
}

const login = (email: string, ip?: string) => loginPOST(req("/api/v1/admin/auth/login", { body: { email, passphrase: PASS }, ip }));
const code = (cookie: string, path: string, value: string, ip?: string) =>
  ({ "/login/mfa": loginMfaPOST, "/mfa/verify": verifyPOST, "/mfa/step-up": stepUpPOST })[path]!(
    req(`/api/v1/admin/auth${path}`, { cookie, body: { code: value }, ip }),
  );
const publish = (init: { cookie?: string; token?: string }) =>
  policiesRoute.POST(req("/api/v1/admin/policies", { ...init, body: { policyType: "terms", locale: "en", version: `v-${++ipN}` } }));

/** Owner: passphrase + TOTP; returns the full session cookie. */
async function ownerSession(): Promise<string> {
  const pending = cookieOf(await login("owner@example.test"));
  tick();
  const res = await code(pending, "/login/mfa", await totp(OWNER_SECRET));
  expect(res.status).toBe(200);
  return cookieOf(res);
}

beforeEach(async () => {
  store.tables = { enquiries: [], idempotency_keys: [], outbox_events: [], consent_events: [], policy_publications: [], privacy_requests: [], staff_users: [], staff_sessions: [], staff_backup_codes: [] };
  resetRateLimits();
  delete ENV.USAM_ADMIN_TOKEN;
  ENV.USAM_MFA_ENCRYPTION_KEY = KEY;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-01T08:00:00.000Z"));
  await addUser("owner@example.test", "super_admin", OWNER_SECRET);
  await addUser("new-admin@example.test", "admin");
  await addUser("agent@example.test", "lead_inbox_agent");
});
afterEach(() => {
  vi.useRealTimers();
  delete ENV.USAM_MFA_ENCRYPTION_KEY;
});

describe("TOTP (RFC 6238, SHA-1, 6 digits, 30 s)", () => {
  it("matches the RFC 6238 SHA-1 test vectors (last 6 digits)", async () => {
    const secret = base32Encode(new TextEncoder().encode("12345678901234567890"));
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(await totp(secret, 59_000)).toBe("287082");
    expect(await totp(secret, 1_111_111_109_000)).toBe("081804");
    expect(await totp(secret, 1_234_567_890_000)).toBe("005924");
    expect(await totp(secret, 20_000_000_000_000)).toBe("353130");
  });

  it("otpauth URI names the issuer, account and parameters", () => {
    expect(otpauthUri("a@b.test", "ABC")).toBe("otpauth://totp/USAM%3Aa%40b.test?secret=ABC&issuer=USAM&algorithm=SHA1&digits=6&period=30");
  });
});

describe("enrolment (required for admin and super_admin)", () => {
  it("admin without MFA: enrol-only session, blocked from admin routes, setup -> verify -> 10 backup codes -> full access", async () => {
    const first = await login("new-admin@example.test");
    expect(first.status).toBe(200);
    expect((await json(first)).data.mfaSetupRequired).toBe(true);
    const enrol = cookieOf(first);
    expect(first.headers.get("set-cookie")).toContain("Max-Age=900");
    const blocked = await leadsRoute.GET(req("/api/v1/admin/leads", { method: "GET", cookie: enrol }));
    expect(blocked.status).toBe(403);
    expect((await json(blocked)).error.message).toMatch(/Set up MFA/);

    const setup = await setupPOST(req("/api/v1/admin/auth/mfa/setup", { cookie: enrol }));
    expect(setup.status).toBe(200);
    expect(setup.headers.get("cache-control")).toBe("no-store");
    const { secret, otpauthUri: uri } = (await json(setup)).data as { secret: string; otpauthUri: string };
    expect(uri).toContain(`secret=${secret}`);
    const row = store.tables.staff_users.find((u) => u.email === "new-admin@example.test")!;
    expect(String(row.mfaSecretEnc)).toMatch(/^v1:/);
    expect(String(row.mfaSecretEnc)).not.toContain(secret); // encrypted at rest
    expect(row.mfaEnabledAt).toBeNull();

    const wrong = await code(enrol, "/mfa/verify", "000000");
    expect(wrong.status).toBe(401);
    expect((await json(wrong)).error.message).toBe(BAD_CODE);

    tick();
    const ok = await code(enrol, "/mfa/verify", ` ${await totp(secret)} `); // pasted with spaces
    expect(ok.status).toBe(200);
    const backupCodes = (await json(ok)).data.backupCodes as string[];
    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);
    for (const c of backupCodes) expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const stored = store.tables.staff_backup_codes.map((r) => String(r.codeHash));
    expect(stored).toHaveLength(10);
    for (const c of backupCodes) expect(stored.join()).not.toContain(c.replace("-", "")); // hashes only

    const full = cookieOf(ok);
    expect(full).not.toBe(enrol);
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { method: "GET", cookie: enrol }))).status).toBe(401); // old one ended
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { method: "GET", cookie: full }))).status).toBe(200);
    expect((await json(await meGET(req("/api/v1/admin/auth/me", { method: "GET", cookie: full })))).data.mfa).toEqual({ enabled: true, required: true, setupRequired: false });
    expect((await setupPOST(req("/api/v1/admin/auth/mfa/setup", { cookie: full }))).status).toBe(409); // already on
  });

  it("B2: setup for an enrolled user changes nothing, even with a stale user row (race)", async () => {
    const owner = store.tables.staff_users[0];
    const before = { enc: owner.mfaSecretEnc, at: owner.mfaEnabledAt };
    const cookie = await ownerSession();
    expect((await setupPOST(req("/api/v1/admin/auth/mfa/setup", { cookie }))).status).toBe(409);
    // A parallel request that read the row before MFA was on: the UPDATE is conditional.
    const stale = { ...owner, mfaEnabledAt: null } as unknown as StaffUser;
    expect(await startEnrolment(stale)).toBeNull();
    expect({ enc: owner.mfaSecretEnc, at: owner.mfaEnabledAt }).toEqual(before);
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { method: "GET", cookie }))).status).toBe(200);
  });

  it("B2: verify only turns on the secret the code was made from (a second setup replaces the first)", async () => {
    const enrol = cookieOf(await login("new-admin@example.test"));
    const first = (await json(await setupPOST(req("/api/v1/admin/auth/mfa/setup", { cookie: enrol })))).data.secret as string;
    const second = (await json(await setupPOST(req("/api/v1/admin/auth/mfa/setup", { cookie: enrol })))).data.secret as string;
    tick();
    expect((await code(enrol, "/mfa/verify", await totp(first))).status).toBe(401);
    expect((await code(enrol, "/mfa/verify", await totp(second))).status).toBe(200);
  });

  it("refuses set-up with a clear error when USAM_MFA_ENCRYPTION_KEY is not set, and stores nothing", async () => {
    const enrol = cookieOf(await login("new-admin@example.test"));
    delete ENV.USAM_MFA_ENCRYPTION_KEY;
    const res = await setupPOST(req("/api/v1/admin/auth/mfa/setup", { cookie: enrol }));
    expect(res.status).toBe(503);
    expect((await json(res)).error.message).toContain("USAM_MFA_ENCRYPTION_KEY");
    expect(store.tables.staff_users.find((u) => u.email === "new-admin@example.test")!.mfaSecretEnc).toBeNull();
  });

  it("a session opened before MFA existed (stage full, no MFA) cannot use admin routes for a required role", async () => {
    const agentFull = cookieOf(await login("agent@example.test"));
    // Re-point the agent's full session row at the admin without MFA.
    store.tables.staff_sessions.at(-1)!.userId = 2;
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { method: "GET", cookie: agentFull }))).status).toBe(403);
  });

  it("lead_inbox_agent: MFA optional, signs in directly", async () => {
    const res = await login("agent@example.test");
    expect((await json(res)).data.mfaSetupRequired).toBe(false);
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { method: "GET", cookie: cookieOf(res) }))).status).toBe(200);
  });
});

describe("sign-in second step", () => {
  it("passphrase alone gives no session: the pending cookie opens nothing; the code creates the session", async () => {
    const first = await login("owner@example.test");
    expect(first.status).toBe(200);
    const body = await json(first);
    expect(body.data).toEqual({ mfaRequired: true });
    const pending = cookieOf(first);
    expect(first.headers.get("set-cookie")).toContain("Max-Age=300");
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { method: "GET", cookie: pending }))).status).toBe(401);
    expect((await meGET(req("/api/v1/admin/auth/me", { method: "GET", cookie: pending }))).status).toBe(401);
    tick();
    const ok = await code(pending, "/login/mfa", await totp(OWNER_SECRET));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toContain("Max-Age=28800");
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { method: "GET", cookie: cookieOf(ok) }))).status).toBe(200);
  });

  it("wrong code, no pending step and an expired pending step: same 401 and message", async () => {
    const pending = cookieOf(await login("owner@example.test"));
    const shapes = [];
    for (const [cookie, value] of [[pending, "123456"], ["", await totp(OWNER_SECRET)], ["x".repeat(43), await totp(OWNER_SECRET)]]) {
      const res = await code(cookie, "/login/mfa", value);
      shapes.push(JSON.stringify({ status: res.status, message: (await json(res)).error.message }));
    }
    vi.setSystemTime(new Date(Date.now() + 5 * 60_000 + 1000)); // pending step expired
    const late = await code(pending, "/login/mfa", await totp(OWNER_SECRET));
    shapes.push(JSON.stringify({ status: late.status, message: (await json(late)).error.message }));
    expect(new Set(shapes).size).toBe(1);
    expect(JSON.parse(shapes[0])).toEqual({ status: 401, message: BAD_CODE });
  });

  it("replay: a code (time step) that was accepted once is refused the second time", async () => {
    tick();
    const value = await totp(OWNER_SECRET);
    const p1 = cookieOf(await login("owner@example.test"));
    expect((await code(p1, "/login/mfa", value)).status).toBe(200);
    const p2 = cookieOf(await login("owner@example.test"));
    expect((await code(p2, "/login/mfa", value)).status).toBe(401);
    // An earlier step (inside the +-1 window) is refused too.
    const p3 = cookieOf(await login("owner@example.test"));
    expect((await code(p3, "/login/mfa", await totp(OWNER_SECRET, Date.now() - 30_000))).status).toBe(401);
    tick();
    expect((await code(p3, "/login/mfa", await totp(OWNER_SECRET))).status).toBe(200);
  });

  it("accepts one step of clock drift either way, not two", async () => {
    tick();
    tick();
    const p = cookieOf(await login("owner@example.test"));
    expect((await code(p, "/login/mfa", await totp(OWNER_SECRET, Date.now() + 60_000))).status).toBe(401);
    expect((await code(p, "/login/mfa", await totp(OWNER_SECRET, Date.now() + 30_000))).status).toBe(200);
  });

  it("a backup code works once (pasted in lower case), then never again", async () => {
    const cookie = await ownerSession();
    expect((await code(cookie, "/mfa/step-up", await totp(OWNER_SECRET, Date.now() + 30_000))).status).toBe(200);
    const codes = (await json(await backupPOST(req("/api/v1/admin/auth/mfa/backup-codes", { cookie })))).data.backupCodes as string[];
    const p1 = cookieOf(await login("owner@example.test"));
    expect((await code(p1, "/login/mfa", codes[0].toLowerCase())).status).toBe(200);
    const p2 = cookieOf(await login("owner@example.test"));
    expect((await code(p2, "/login/mfa", codes[0])).status).toBe(401);
    expect((await code(p2, "/login/mfa", codes[1])).status).toBe(200);
  });

  it("lockout counts wrong codes: 5 from one IP lock the pair, even for the right code", async () => {
    const A = "203.0.113.50";
    const pending = cookieOf(await login("owner@example.test", A));
    for (let i = 0; i < 5; i++) expect((await code(pending, "/login/mfa", "111111", A)).status).toBe(401);
    tick();
    const locked = await code(pending, "/login/mfa", await totp(OWNER_SECRET), A);
    expect(locked.status).toBe(401);
    expect((await json(locked)).error.message).toBe(BAD_CODE);
    expect(store.tables.staff_users[0].mfaLastStep).toBe(0); // the code was not even checked
  });

  it("B1: 5 wrong codes on one pending session end it, even from 5 different IPs", async () => {
    const pending = cookieOf(await login("owner@example.test"));
    for (let i = 0; i < 5; i++) expect((await code(pending, "/login/mfa", "111111", `198.51.100.${i + 1}`)).status).toBe(401);
    const row = store.tables.staff_sessions.find((s) => s.stage === "mfa_pending")!;
    expect(Date.parse(String(row.expiresAt))).toBeLessThanOrEqual(Date.now()); // revoked in the DB
    tick();
    const late = await code(pending, "/login/mfa", await totp(OWNER_SECRET), "198.51.100.9");
    expect(late.status).toBe(401);
    expect((await json(late)).error.message).toBe(BAD_CODE);
    // A fresh sign-in still works (the account is not locked by this).
    const fresh = cookieOf(await login("owner@example.test"));
    expect((await code(fresh, "/login/mfa", await totp(OWNER_SECRET))).status).toBe(200);
  });

  it("B1: 4 wrong codes leave the pending session usable", async () => {
    const pending = cookieOf(await login("owner@example.test"));
    for (let i = 0; i < 4; i++) await code(pending, "/login/mfa", "111111", `198.51.101.${i + 1}`);
    tick();
    expect((await code(pending, "/login/mfa", await totp(OWNER_SECRET))).status).toBe(200);
  });

  it("accepts a code typed in Arabic-Indic or Eastern Arabic-Indic digits", async () => {
    tick();
    const toArabic = (s: string, base: number) => [...s].map((d) => String.fromCharCode(base + Number(d))).join("");
    const p1 = cookieOf(await login("owner@example.test"));
    expect((await code(p1, "/login/mfa", toArabic(await totp(OWNER_SECRET), 0x0660))).status).toBe(200);
    tick();
    const p2 = cookieOf(await login("owner@example.test"));
    expect((await code(p2, "/login/mfa", toArabic(await totp(OWNER_SECRET), 0x06f0))).status).toBe(200);
  });

  it("a secret that cannot be decrypted (key changed) gets its own error, not 'key missing'", async () => {
    const pending = cookieOf(await login("owner@example.test"));
    ENV.USAM_MFA_ENCRYPTION_KEY = "z".repeat(40); // a different key
    tick();
    const res = await code(pending, "/login/mfa", await totp(OWNER_SECRET));
    expect(res.status).toBe(500);
    const msg = (await json(res)).error.message;
    expect(msg).toMatch(/cannot be checked/);
    expect(msg).not.toContain("USAM_MFA_ENCRYPTION_KEY");
  });

  it("rate limit: more than 10 MFA requests per IP in 15 min -> 429", async () => {
    const A = "203.0.113.51";
    for (let i = 0; i < 10; i++) await code("", "/login/mfa", "111111", A);
    expect((await code("", "/login/mfa", "111111", A)).status).toBe(429);
  });
});

describe("step-up for sensitive actions (5 minutes)", () => {
  it("policy publish needs an MFA check in the last 5 min; step-up renews it", async () => {
    const cookie = await ownerSession();
    expect([401, 403]).not.toContain((await publish({ cookie })).status);
    vi.setSystemTime(new Date(Date.now() + 5 * 60_000 + 1000));
    const stale = await publish({ cookie });
    expect(stale.status).toBe(403);
    expect((await json(stale)).error.message).toMatch(/fresh MFA code/);
    expect((await leadsRoute.GET(req("/api/v1/admin/leads", { method: "GET", cookie }))).status).toBe(200); // not sensitive
    expect((await code(cookie, "/mfa/step-up", "000000")).status).toBe(401);
    expect((await code(cookie, "/mfa/step-up", await totp(OWNER_SECRET))).status).toBe(200);
    expect([401, 403]).not.toContain((await publish({ cookie })).status);
  });

  it("new backup codes need step-up; the new set replaces the old one", async () => {
    const cookie = await ownerSession();
    const first = (await json(await backupPOST(req("/api/v1/admin/auth/mfa/backup-codes", { cookie })))).data.backupCodes as string[];
    vi.setSystemTime(new Date(Date.now() + 5 * 60_000 + 1000));
    expect((await backupPOST(req("/api/v1/admin/auth/mfa/backup-codes", { cookie }))).status).toBe(403);
    expect((await code(cookie, "/mfa/step-up", await totp(OWNER_SECRET))).status).toBe(200);
    const second = await backupPOST(req("/api/v1/admin/auth/mfa/backup-codes", { cookie }));
    expect(second.status).toBe(200);
    expect(store.tables.staff_backup_codes.filter((r) => r.usedAt == null)).toHaveLength(10);
    const p = cookieOf(await login("owner@example.test"));
    expect((await code(p, "/login/mfa", first[0])).status).toBe(401); // old set retired
  });
});

describe("break-glass x-admin-token (unchanged)", () => {
  it("publishes with the token and no session or MFA", async () => {
    ENV.USAM_ADMIN_TOKEN = TOKEN;
    expect([401, 403]).not.toContain((await publish({ token: TOKEN })).status);
    expect((await publish({ token: "wrong" })).status).toBe(401);
  });
});
