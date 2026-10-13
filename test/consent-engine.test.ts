// Verifies the cookie consent ENGINE actually gates optional trackers:
//  - nothing loads before a choice is made,
//  - a tracker loads only after its category is accepted,
//  - withdrawal tears the tracker down (unload called).
// Uses a controlled fake tracker via registerOptionalTech — no production
// tracker is added. A minimal localStorage/window stub stands in for the DOM.

import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Minimal localStorage + window stub (vitest runs in node here).
class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
g.window = { localStorage: new MemStorage() };
g.localStorage = (g.window as { localStorage: unknown }).localStorage;

import {
  acceptAll,
  hasOptionalTech,
  rejectAll,
  registerOptionalTech,
  shouldShowBanner,
  setChoice,
  type OptionalTech,
} from "@/lib/consent-manager";

let loaded = 0;
let unloaded = 0;
let unregister: (() => void) | null = null;

function fakeAnalytics(): OptionalTech {
  return {
    id: "test-analytics",
    category: "analytics",
    label: { en: "Test Analytics", ar: "تحليلات اختبارية" },
    load: () => { loaded++; },
    unload: () => { unloaded++; },
  };
}

describe("consent engine gating (controlled fake tracker)", () => {
  beforeEach(() => {
    (g.localStorage as MemStorage).clear();
    loaded = 0;
    unloaded = 0;
    unregister = registerOptionalTech(fakeAnalytics());
  });
  afterEach(() => {
    unregister?.();
    unregister = null;
  });

  it("shows a banner only when optional tech exists and no choice is recorded", () => {
    expect(hasOptionalTech()).toBe(true);
    expect(shouldShowBanner()).toBe(true); // no choice yet
  });

  it("does NOT load the tracker before any consent choice", () => {
    // Merely registering + rendering must not run the tracker.
    expect(loaded).toBe(0);
  });

  it("loads the tracker only after the category is accepted", () => {
    acceptAll();
    expect(loaded).toBe(1);
    expect(shouldShowBanner()).toBe(false); // choice recorded
  });

  it("does NOT load the tracker when optional cookies are rejected", () => {
    rejectAll();
    expect(loaded).toBe(0);
  });

  it("tears the tracker down when consent is withdrawn after being granted", () => {
    acceptAll();
    expect(loaded).toBe(1);
    // Withdraw by setting the analytics category to false.
    setChoice({ analytics: false });
    expect(unloaded).toBe(1);
  });

  it("with NO optional tech registered, there is nothing to consent to (no banner)", () => {
    unregister?.();
    unregister = null;
    expect(hasOptionalTech()).toBe(false);
    expect(shouldShowBanner()).toBe(false);
  });
});
