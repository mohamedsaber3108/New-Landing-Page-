// A minimal in-memory stand-in for the Drizzle-D1 database used by the lead and
// idempotency logic. It implements ONLY the method chains those modules call,
// but with faithful semantics for the parts the tests care about:
//
//   - insert(table).values(row).onConflictDoNothing().returning(cols)
//       honors the composite primary key / unique index: a duplicate key
//       affects zero rows and returns [], exactly like SQLite.
//   - insert(table).values(row)        (no returning)
//   - select(cols?).from(table).where(pred).orderBy().limit(n)
//   - update(table).set(patch).where(pred)
//   - transaction(cb)                  runs cb against the same store
//
// Drizzle's `eq` / `and` return opaque descriptors; we interpret the ones our
// code builds. This is enough to test idempotency races, replay, body-mismatch
// conflicts, and the lead+outbox transactional write without native modules.

import { enquiries, idempotencyKeys, outboxEvents } from "@/db/schema";

type Row = Record<string, unknown>;

// --- predicate descriptors (shadow drizzle's eq/and just enough) ------------
type Pred = { kind: "eq"; col: ColRef; value: unknown } | { kind: "and"; parts: Pred[] };
type ColRef = { _table: string; _name: string };

function colName(col: unknown): { table: string; name: string } {
  ensureRegistry();
  // Map a drizzle column object to {table,name} by identity.
  const ref = COLUMN_REGISTRY.get(col as object);
  if (!ref) throw new Error("Unknown column in predicate");
  return ref;
}

// Build a registry mapping each real drizzle column object -> {table,name}.
// Built lazily so importing this module never races with vi.mock hoisting.
const COLUMN_REGISTRY = new Map<object, { table: string; name: string }>();
let registryBuilt = false;
function ensureRegistry() {
  if (registryBuilt) return;
  const register = (table: string, cols: Record<string, unknown>) => {
    for (const [name, col] of Object.entries(cols)) {
      if (col && typeof col === "object") COLUMN_REGISTRY.set(col as object, { table, name });
    }
  };
  register("enquiries", enquiries as unknown as Record<string, unknown>);
  register("idempotency_keys", idempotencyKeys as unknown as Record<string, unknown>);
  register("outbox_events", outboxEvents as unknown as Record<string, unknown>);
  registryBuilt = true;
}

// Column name used in the JS row (drizzle select returns the JS key, but our
// code inserts using JS keys too). We map drizzle column -> JS property name by
// reading the registry name, which matches the schema's JS key.

export const eqFake = (col: unknown, value: unknown): Pred => ({ kind: "eq", col: col as ColRef, value });
export const andFake = (...parts: Pred[]): Pred => ({ kind: "and", parts });

function tableKey(table: unknown): string {
  if (table === enquiries) return "enquiries";
  if (table === idempotencyKeys) return "idempotency_keys";
  if (table === outboxEvents) return "outbox_events";
  throw new Error("Unknown table");
}

// Unique-key extractor per table (the constraint that makes inserts race-safe).
function uniqueKey(table: string, row: Row): string | null {
  if (table === "idempotency_keys") return `${row.scope}\u0000${row.actor}\u0000${row.key}`;
  if (table === "enquiries") return row.reference != null ? `ref:${row.reference}` : null;
  if (table === "outbox_events") return row.eventId != null ? `evt:${row.eventId}` : null;
  return null;
}

export class FakeStore {
  tables: Record<string, Row[]> = { enquiries: [], idempotency_keys: [], outbox_events: [] };
  private seq: Record<string, number> = { enquiries: 0, outbox_events: 0 };

  private matches(table: string, row: Row, pred: Pred): boolean {
    if (pred.kind === "and") return pred.parts.every((p) => this.matches(table, row, p));
    const { name } = colName(pred.col);
    return row[name] === pred.value;
  }

  private insertRow(table: string, values: Row): Row | null {
    const key = uniqueKey(table, values);
    if (key) {
      const existing = this.tables[table].some((r) => uniqueKey(table, r) === key);
      if (existing) return null; // unique violation -> onConflictDoNothing
    }
    const row: Row = { ...values };
    if (table === "enquiries" || table === "outbox_events") {
      if (row.id == null) row.id = ++this.seq[table];
    }
    if (row.createdAt == null) row.createdAt = new Date().toISOString();
    this.tables[table].push(row);
    return row;
  }

  // Query-builder surface used by the code under test.
  insert(table: unknown) {
    const t = tableKey(table);
    const store = this;
    return {
      values(values: Row) {
        let conflictDoNothing = false;
        const chain = {
          onConflictDoNothing() {
            conflictDoNothing = true;
            return chain;
          },
          returning(_cols?: unknown) {
            const row = store.insertRow(t, values);
            if (row) return Promise.resolve([{ ...row }]);
            if (conflictDoNothing) return Promise.resolve([]);
            return Promise.reject(new Error("UNIQUE constraint failed"));
          },
          then(resolve: (v: unknown) => void, reject: (e: unknown) => void) {
            // Awaited without returning(): perform the insert now.
            const row = store.insertRow(t, values);
            if (!row && !conflictDoNothing) return reject(new Error("UNIQUE constraint failed"));
            return resolve(undefined);
          },
        };
        return chain;
      },
    };
  }

  select(cols?: Record<string, unknown>) {
    const store = this;
    return {
      from(table: unknown) {
        const t = tableKey(table);
        let pred: Pred | null = null;
        let lim = Infinity;
        const builder = {
          where(p: Pred) {
            pred = p;
            return builder;
          },
          orderBy() {
            return builder;
          },
          limit(n: number) {
            lim = n;
            return result();
          },
          then(resolve: (v: unknown) => void) {
            return resolve(result());
          },
        };
        function result() {
          let rows = store.tables[t].filter((r) => (pred ? store.matches(t, r, pred) : true));
          rows = rows.slice(0, lim);
          if (cols) {
            return rows.map((r) => {
              const out: Row = {};
              for (const [alias, col] of Object.entries(cols)) {
                const { name } = colName(col);
                out[alias] = r[name];
              }
              return out;
            });
          }
          return rows.map((r) => ({ ...r }));
        }
        return builder;
      },
    };
  }

  update(table: unknown) {
    const t = tableKey(table);
    const store = this;
    return {
      set(patch: Row) {
        return {
          where(pred: Pred) {
            for (const row of store.tables[t]) {
              if (store.matches(t, row, pred)) Object.assign(row, patch);
            }
            return Promise.resolve();
          },
        };
      },
    };
  }

  async transaction<T>(cb: (tx: FakeStore) => Promise<T>): Promise<T> {
    // Snapshot for rollback on throw (good enough for our single-writer tests).
    const snapshot = structuredClone(this.tables);
    const snapSeq = { ...this.seq };
    try {
      return await cb(this);
    } catch (e) {
      this.tables = snapshot;
      this.seq = snapSeq;
      throw e;
    }
  }
}
