// Verifies the safe in-text policy link parser: known targets become links,
// unknown targets degrade to plain text (never a broken/unsafe href), anchors
// are restricted, and ordinary prose is untouched. This is the structured,
// no-raw-HTML cross-link mechanism (gap 4).

import { describe, expect, it } from "vitest";
import { parseInlineLinks, hasInlineLinks, LINK_TARGETS } from "@/lib/legal/inline-links";

describe("parseInlineLinks", () => {
  it("leaves plain text as a single text token", () => {
    const t = parseInlineLinks("No links here at all.");
    expect(t).toEqual([{ kind: "text", text: "No links here at all." }]);
  });

  it("turns a known target into a link with the right internal href", () => {
    const t = parseInlineLinks("See the [[Cookie Policy|cookies]] for details.");
    expect(t).toEqual([
      { kind: "text", text: "See the " },
      { kind: "link", label: "Cookie Policy", href: "/cookies" },
      { kind: "text", text: " for details." },
    ]);
  });

  it("supports a safe #section anchor on a known target", () => {
    const t = parseInlineLinks("see [[International transfers|privacy#international-transfers]].");
    expect(t[1]).toEqual({
      kind: "link",
      label: "International transfers",
      href: "/privacy#international-transfers",
    });
  });

  it("degrades an UNKNOWN target to plain text (no broken link)", () => {
    const t = parseInlineLinks("go to [[Somewhere|not-a-real-target]] now");
    expect(t.some((x) => x.kind === "link")).toBe(false);
    // The visible label survives as text.
    expect(t.map((x) => (x.kind === "text" ? x.text : "")).join("")).toContain("Somewhere");
  });

  it("drops an unsafe anchor but keeps the base link (never injects it)", () => {
    const t = parseInlineLinks("[[x|privacy#javascript:alert(1)]]");
    expect(t[0]).toEqual({ kind: "link", label: "x", href: "/privacy" });
  });

  it("handles multiple tokens in one paragraph", () => {
    const t = parseInlineLinks("[[A|privacy]] and [[B|payments]].");
    const links = t.filter((x) => x.kind === "link");
    expect(links).toEqual([
      { kind: "link", label: "A", href: "/privacy" },
      { kind: "link", label: "B", href: "/payments" },
    ]);
  });

  it("never emits an href outside the internal allowlist", () => {
    for (const [, href] of Object.entries(LINK_TARGETS)) {
      expect(href.startsWith("/")).toBe(true); // internal, relative
    }
  });

  it("hasInlineLinks detects token presence", () => {
    expect(hasInlineLinks("plain")).toBe(false);
    expect(hasInlineLinks("a [[L|terms]] b")).toBe(true);
  });
});
