import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeStore } from "./fake-db";

// Mock drizzle-orm WITHOUT importOriginal and WITHOUT referencing imported
// bindings (vi.mock is hoisted). The predicate shape matches FakeStore.
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, value: unknown) => ({ kind: "eq", col, value }),
  and: (...parts: unknown[]) => ({ kind: "and", parts }),
  desc: (c: unknown) => c,
  sql: (strings: TemplateStringsArray) => ({ _sql: strings.join("") }),
}));

import { hashBody, reserveIdempotencyKey, sha256Hex, type Db } from "@/lib/api/idempotency";

const scope = "POST /api/v1/leads";

describe("hashBody / sha256Hex", () => {
  it("is stable regardless of key order", async () => {
    const a = await hashBody({ x: 1, y: 2 });
    const b = await hashBody({ y: 2, x: 1 });
    expect(a).toBe(b);
  });

  it("changes when a value changes", async () => {
    const a = await hashBody({ x: 1 });
    const b = await hashBody({ x: 2 });
    expect(a).not.toBe(b);
  });

  it("produces 64 hex chars", async () => {
    expect(await sha256Hex("hello")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("reserveIdempotencyKey", () => {
  let store: FakeStore;
  beforeEach(() => {
    store = new FakeStore();
  });

  it("first caller proceeds and records a completed response for replay", async () => {
    const db = store as unknown as Db;
    const first = await reserveIdempotencyKey(db, { key: "k1", scope, actor: "anonymous", requestHash: "h1" });
    expect(first.outcome).toBe("proceed");
    if (first.outcome !== "proceed") return;
    await first.complete(201, JSON.stringify({ reference: "USAM-ABC123" }));

    const second = await reserveIdempotencyKey(db, { key: "k1", scope, actor: "anonymous", requestHash: "h1" });
    expect(second.outcome).toBe("replay");
    if (second.outcome === "replay") {
      expect(second.responseStatus).toBe(201);
      expect(JSON.parse(second.responseBody).reference).toBe("USAM-ABC123");
    }
  });

  it("same key + different body is a conflict (body_mismatch)", async () => {
    const db = store as unknown as Db;
    await reserveIdempotencyKey(db, { key: "k2", scope, actor: "anonymous", requestHash: "hA" });
    const clash = await reserveIdempotencyKey(db, { key: "k2", scope, actor: "anonymous", requestHash: "hB" });
    expect(clash.outcome).toBe("conflict");
    if (clash.outcome === "conflict") expect(clash.reason).toBe("body_mismatch");
  });

  it("same key still processing (not completed) is an in_flight conflict", async () => {
    const db = store as unknown as Db;
    const first = await reserveIdempotencyKey(db, { key: "k3", scope, actor: "anonymous", requestHash: "h3" });
    expect(first.outcome).toBe("proceed"); // not completed yet
    const second = await reserveIdempotencyKey(db, { key: "k3", scope, actor: "anonymous", requestHash: "h3" });
    expect(second.outcome).toBe("conflict");
    if (second.outcome === "conflict") expect(second.reason).toBe("in_flight");
  });

  it("concurrent reservations with the same key: exactly one proceeds", async () => {
    const db = store as unknown as Db;
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        reserveIdempotencyKey(db, { key: "race", scope, actor: "anonymous", requestHash: "hr" }),
      ),
    );
    const proceeds = results.filter((r) => r.outcome === "proceed");
    const conflicts = results.filter((r) => r.outcome === "conflict");
    expect(proceeds).toHaveLength(1);
    expect(conflicts).toHaveLength(4);
    // Only one row exists for the key.
    expect(store.tables.idempotency_keys).toHaveLength(1);
  });

  it("different actors do not collide on the same key", async () => {
    const db = store as unknown as Db;
    const a = await reserveIdempotencyKey(db, { key: "shared", scope, actor: "user_a", requestHash: "h" });
    const b = await reserveIdempotencyKey(db, { key: "shared", scope, actor: "user_b", requestHash: "h" });
    expect(a.outcome).toBe("proceed");
    expect(b.outcome).toBe("proceed");
  });
});
