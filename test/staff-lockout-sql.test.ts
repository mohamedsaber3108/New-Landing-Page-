// review-015 finding 2: the account-wide failed counter is ONE atomic UPDATE.
// Runs the real drizzle query (no mocks) against a real SQLite (node:sqlite)
// with migration 0005, and checks both the SQL text and the result.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { describe, expect, it } from "vitest";

// Vite cannot bundle the "node:sqlite" builtin, so it is loaded at run time.
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "@/db/schema";
import { ACCOUNT_LOCK_THRESHOLD, recordAccountFailure } from "@/lib/api/staff-lockout";

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  const migration = readFileSync(path.resolve(__dirname, "../drizzle/0005_cool_bullseye.sql"), "utf8");
  for (const stmt of migration.split("--> statement-breakpoint")) if (stmt.trim()) sqlite.exec(stmt);
  sqlite.prepare("INSERT INTO staff_users (email, display_name, role, password_hash) VALUES ('a@x.test','A','admin','h')").run();
  const statements: string[] = [];
  const db = drizzle(
    async (sqlText, params, method) => {
      statements.push(sqlText);
      const st = sqlite.prepare(sqlText);
      if (method === "run") {
        st.run(...(params as never[]));
        return { rows: [] };
      }
      return { rows: st.all(...(params as never[])).map((r) => Object.values(r as object)) };
    },
    { schema },
  );
  const row = () => sqlite.prepare("SELECT failed_count, locked_until FROM staff_users WHERE id = 1").get() as { failed_count: number; locked_until: string | null };
  return { db, statements, row };
}

describe("recordAccountFailure", () => {
  it("is a single UPDATE that adds 1 in SQL (no read-modify-write)", async () => {
    const { db, statements, row } = setup();
    await recordAccountFailure(db as never, 1, Date.now());
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/^update "staff_users" set /i);
    expect(statements[0]).toMatch(/"failed_count" \+ 1/);
    expect(row().failed_count).toBe(1);
  });

  it("parallel failures are all counted, and the lock is set in the same statement at the threshold", async () => {
    const { db, row } = setup();
    await Promise.all(Array.from({ length: ACCOUNT_LOCK_THRESHOLD - 1 }, () => recordAccountFailure(db as never, 1, Date.now())));
    expect(row()).toEqual({ failed_count: ACCOUNT_LOCK_THRESHOLD - 1, locked_until: null });
    const now = Date.parse("2026-06-01T08:00:00.000Z");
    await recordAccountFailure(db as never, 1, now);
    expect(row()).toEqual({ failed_count: 0, locked_until: new Date(now + 15 * 60_000).toISOString() });
  });
});
