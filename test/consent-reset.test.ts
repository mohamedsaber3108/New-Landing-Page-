// Verifies "Reset saved preferences" (Cookie Settings) is SAFE:
//  - it removes ONLY the three documented USAM preference keys,
//  - it NEVER calls localStorage.clear() / touches unrelated keys,
//  - it reports exactly which keys it removed,
//  - after a reset the keys are actually gone (so a reload returns to defaults).
//
// This is the unit-level proof behind the gap-2 requirement. It does not (and
// cannot, in a node test env) exercise the live React effects; the QA report
// records the manual browser checklist for the UI-level reload behavior.

import { beforeEach, describe, expect, it } from "vitest";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get size() { return this.m.size; }
  keys() { return Array.from(this.m.keys()); }
}

const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
g.window = { localStorage: new MemStorage() };
g.localStorage = (g.window as { localStorage: unknown }).localStorage;

import {
  USAM_STORAGE_KEYS,
  STORAGE_ITEMS,
  resetSavedPreferences,
} from "@/lib/consent-manager";

const store = () => g.localStorage as MemStorage;

describe("resetSavedPreferences — scoped, allowlisted reset", () => {
  beforeEach(() => store().clear());

  it("documents exactly the three first-party keys and nothing else", () => {
    expect(USAM_STORAGE_KEYS.slice().sort()).toEqual(
      ["usam-consent", "usam-locale", "usam-theme"].sort(),
    );
    // Every documented storage item is one of the owned keys (UI table == reality).
    for (const item of STORAGE_ITEMS) {
      expect(USAM_STORAGE_KEYS).toContain(item.key);
    }
  });

  it("removes only USAM keys and leaves unrelated storage untouched", () => {
    store().setItem("usam-locale", "ar");
    store().setItem("usam-theme", "dark");
    store().setItem("usam-consent", JSON.stringify({ v: 1 }));
    // Unrelated keys that must survive (e.g. another app on the same origin).
    store().setItem("some-other-app", "keep-me");
    store().setItem("auth-token", "do-not-touch");

    const removed = resetSavedPreferences();

    expect(removed.slice().sort()).toEqual(
      ["usam-consent", "usam-locale", "usam-theme"].sort(),
    );
    // USAM keys gone...
    expect(store().getItem("usam-locale")).toBeNull();
    expect(store().getItem("usam-theme")).toBeNull();
    expect(store().getItem("usam-consent")).toBeNull();
    // ...unrelated keys preserved.
    expect(store().getItem("some-other-app")).toBe("keep-me");
    expect(store().getItem("auth-token")).toBe("do-not-touch");
    expect(store().keys().sort()).toEqual(["auth-token", "some-other-app"]);
  });

  it("only reports keys that were actually present", () => {
    store().setItem("usam-theme", "dark"); // only one of the three present
    store().setItem("unrelated", "x");

    const removed = resetSavedPreferences();

    expect(removed).toEqual(["usam-theme"]); // not the absent two
    expect(store().getItem("unrelated")).toBe("x");
  });

  it("returns an empty list when there is nothing to reset", () => {
    store().setItem("unrelated", "x");
    expect(resetSavedPreferences()).toEqual([]);
    expect(store().getItem("unrelated")).toBe("x");
  });

  it("the reset leaves the keys absent (so a reload reads defaults, not stale prefs)", () => {
    store().setItem("usam-locale", "ar");
    resetSavedPreferences();
    // Simulate the mount-time read in usam-site.tsx: a missing key -> default.
    const languageOnReload = store().getItem("usam-locale");
    expect(languageOnReload).toBeNull(); // -> component keeps default "en"
  });
});
