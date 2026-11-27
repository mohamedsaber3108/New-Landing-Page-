// Persistence guard for the usam-locale cookie (PR #11 review-011 finding 3),
// with a stubbed document.cookie jar and localStorage:
//  - a theme-only choice sets no cookie;
//  - a language choice (or a restored saved language) sets it;
//  - Reset saved preferences clears it.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistPreferences } from "@/lib/locale";
import { resetSavedPreferences } from "@/lib/consent-manager";

/** Minimal browser cookie jar: honours `name=value` and Max-Age=0 deletes. */
class CookieJar {
  jar = new Map<string, string>();
  writes: string[] = [];
  get cookie() {
    return Array.from(this.jar, ([k, v]) => `${k}=${v}`).join("; ");
  }
  set cookie(line: string) {
    this.writes.push(line);
    const [pair, ...attrs] = line.split(";").map((s) => s.trim());
    const [name, value] = pair.split("=");
    if (attrs.some((a) => /^max-age=0$/i.test(a))) this.jar.delete(name);
    else this.jar.set(name, value);
  }
}

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

let jar: CookieJar;
let storage: MemStorage;

beforeEach(() => {
  jar = new CookieJar();
  storage = new MemStorage();
  vi.stubGlobal("document", jar);
  vi.stubGlobal("location", { protocol: "https:" });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", { localStorage: storage });
});
afterEach(() => vi.unstubAllGlobals());

const base = { ready: true, locale: "ar" as const, theme: "dark" as const };

describe("usam-locale cookie guard", () => {
  it("theme-only choice: localStorage is written, but NO cookie", () => {
    persistPreferences({ ...base, userChose: true, localeChosen: false });
    expect(storage.getItem("usam-theme")).toBe("dark");
    expect(jar.writes).toHaveLength(0);
    expect(jar.cookie).toBe("");
  });

  it("language choice: the cookie is set (en|ar, 1 year, Lax, Secure on https)", () => {
    persistPreferences({ ...base, userChose: true, localeChosen: true });
    expect(jar.cookie).toBe("usam-locale=ar");
    expect(jar.writes[0]).toMatch(/^usam-locale=ar; Path=\/; Max-Age=31536000; SameSite=Lax; Secure$/);
  });

  it("no choice yet, or before the first restore: nothing at all is written", () => {
    persistPreferences({ ...base, userChose: false, localeChosen: false });
    persistPreferences({ ...base, ready: false, userChose: true, localeChosen: true });
    expect(jar.writes).toHaveLength(0);
    expect(storage.m.size).toBe(0);
  });

  it("Reset saved preferences clears the cookie and the storage keys", () => {
    persistPreferences({ ...base, userChose: true, localeChosen: true });
    expect(jar.cookie).toBe("usam-locale=ar");
    const removed = resetSavedPreferences();
    expect(removed.sort()).toEqual(["usam-locale", "usam-theme"]);
    expect(jar.cookie).toBe("");
    expect(jar.writes.at(-1)).toMatch(/^usam-locale=; Path=\/; Max-Age=0/);
  });
});
