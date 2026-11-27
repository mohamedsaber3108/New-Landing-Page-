// Every copy key exists in both languages (008, L-Q2). tsc already enforces the
// SiteCopy shape; this also checks record keys (routes, sections, directory
// labels), array lengths, link hrefs, and that no text is empty.

import { describe, expect, it } from "vitest";
import { siteCopy } from "@/lib/copy";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

/** Every leaf path, with array indices, e.g. "footer.legalLinks.3.href". */
function leaves(value: Json, prefix = ""): Record<string, Json> {
  if (value === null || typeof value !== "object") return { [prefix]: value };
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  return Object.assign({}, ...entries.map(([k, v]) => leaves(v as Json, prefix ? `${prefix}.${k}` : k)));
}

const en = leaves(siteCopy.en as unknown as Json);
const ar = leaves(siteCopy.ar as unknown as Json);

describe("copy parity EN/AR", () => {
  it("has exactly the same keys (including record keys and array positions)", () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it("uses the same link targets in both languages", () => {
    const hrefs = (l: Record<string, Json>) => Object.entries(l).filter(([k]) => k.endsWith(".href"));
    expect(hrefs(ar)).toEqual(hrefs(en));
  });

  it("has no empty text", () => {
    for (const [locale, l] of [["en", en], ["ar", ar]] as const) {
      for (const [k, v] of Object.entries(l)) expect(String(v).trim(), `${locale}:${k}`).not.toBe("");
    }
  });
});
