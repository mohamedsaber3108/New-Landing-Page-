// L-A2 on a real SQLite (node:sqlite + drizzle sqlite-proxy, no drizzle mocks)
// with migration 0007: the UNIQUE prev_hash index stops a fork, and an append
// that loses the race to another writer (another isolate) retries on the new
// last row, so the chain stays one line.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/db/schema";

const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };
const ENV = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process!.env!;
const KEY = "q".repeat(40); // test-only

const state: { sqlite: DatabaseSyncType; beforeInsert?: () => void } = { sqlite: new DatabaseSync(":memory:") };
const db = drizzle(
  async (sqlText, params, method) => {
    if (/^insert into "admin_audit"/i.test(sqlText) && state.beforeInsert) {
      const hook = state.beforeInsert;
      state.beforeInsert = undefined;
      hook();
    }
    const st = state.sqlite.prepare(sqlText);
    if (method === "run") {
      st.run(...(params as never[]));
      return { rows: [] };
    }
    return { rows: st.all(...(params as never[])).map((r) => Object.values(r as object)) };
  },
  { schema },
);
vi.mock("@/db", () => ({ getDb: () => db }));

import { GENESIS_HASH, appendAudit } from "@/lib/api/audit";
import * as chain from "../scripts/audit-chain.mjs";

const all = () => state.sqlite.prepare("SELECT * FROM admin_audit ORDER BY id").all() as Record<string, unknown>[];

beforeEach(() => {
  state.sqlite = new DatabaseSync(":memory:");
  const migration = readFileSync(path.resolve(__dirname, "../drizzle/0007_tiresome_slyde.sql"), "utf8");
  for (const stmt of migration.split("--> statement-breakpoint")) if (stmt.trim()) state.sqlite.exec(stmt);
  ENV.USAM_AUDIT_HMAC_KEY = KEY;
});
afterEach(() => {
  delete ENV.USAM_AUDIT_HMAC_KEY;
});

describe("admin_audit on SQLite", () => {
  it("the UNIQUE prev_hash index refuses a second row after the same row (no fork)", () => {
    const ins = state.sqlite.prepare("INSERT INTO admin_audit (ts, actor_type, action, result, prev_hash, hash) VALUES ('t','break_glass','leads:view','success',?,?)");
    ins.run(GENESIS_HASH, "h1");
    expect(() => ins.run(GENESIS_HASH, "h2")).toThrow(/UNIQUE/);
  });

  it("an append that loses the race to another writer retries and the chain still verifies", async () => {
    await appendAudit(null, { actor: { type: "staff", id: 1, role: "admin" }, action: "leads:view", result: "success" });
    // Another isolate appends a valid row between our read of the last row and our insert.
    state.beforeInsert = () => {
      const last = all().at(-1)!;
      const row = { ts: new Date().toISOString(), actor_type: "break_glass", action: "consent:view", result: "success" };
      const hash = chain.rowHash(KEY, String(last.hash), row);
      state.sqlite.prepare("INSERT INTO admin_audit (ts, actor_type, action, result, prev_hash, hash) VALUES (?,?,?,?,?,?)").run(row.ts, row.actor_type, row.action, row.result, String(last.hash), hash);
    };
    await appendAudit(null, { actor: { type: "staff", id: 2, role: "admin" }, action: "outbox:retry", result: "success" });
    const rows = all();
    expect(rows.map((r) => r.action)).toEqual(["leads:view", "consent:view", "outbox:retry"]);
    expect(chain.verifyRows(KEY, rows)).toMatchObject({ ok: true, rows: 3 });
  });

  it("parallel appends on SQLite keep one chain", async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => appendAudit(null, { actor: { type: "staff", id: i, role: "admin" }, action: "leads:view", result: "success" })));
    expect(chain.verifyRows(KEY, all())).toMatchObject({ ok: true, rows: 10 });
  });
});
