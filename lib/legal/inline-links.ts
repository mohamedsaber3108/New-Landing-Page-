// Safe, structured in-text links for policy body paragraphs (instruction §16:
// "Structured rich-text blocks for links … Do not interpolate untrusted HTML").
//
// A policy body string MAY embed a reference token of the form:
//
//     [[visible label|target]]
//
// where `target` is one of a small, fixed allowlist of internal destinations
// (optionally with a #section anchor), e.g.
//
//     "See the [[Cookie Policy|cookies]] for the full inventory."
//     "…separate from the transfer basis — see [[International transfers|privacy#international-transfers]]."
//
// The token is PLAIN TEXT, so it:
//   - survives the public redaction mirror (stripReviewMarkers / stripMarkers),
//     which only touches "[FOR REVIEW …]" markers;
//   - flows unchanged through the API (body joined with "\n\n" and split back);
//   - is parsed to typed tokens here and rendered as React <Link>/text by the
//     page — it is NEVER turned into HTML via dangerouslySetInnerHTML.
//
// Any target NOT on the allowlist is rendered as its plain visible label (no
// link, no crash) so a typo can never produce a dangling or unsafe href.

/** The internal destinations a policy may link to. Keyed by a stable id. */
export const LINK_TARGETS: Record<string, string> = {
  privacy: "/privacy",
  terms: "/terms",
  cookies: "/cookies",
  refunds: "/refunds",
  payments: "/payments",
  "ai-use": "/ai-use",
  "privacy-requests": "/privacy-requests",
  legal: "/legal",
  contact: "/contact",
  trust: "/trust",
};

export type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "link"; label: string; href: string };

const TOKEN = /\[\[([^|\]]+)\|([^\]]+)\]\]/g;

/**
 * Resolve a token target ("cookies" or "privacy#international-transfers") to a
 * safe internal href, or null if the base key is not on the allowlist.
 */
function resolveHref(target: string): string | null {
  const trimmed = target.trim();
  const hashIndex = trimmed.indexOf("#");
  const key = (hashIndex >= 0 ? trimmed.slice(0, hashIndex) : trimmed).trim();
  const anchor = hashIndex >= 0 ? trimmed.slice(hashIndex) : ""; // includes '#'
  const base = LINK_TARGETS[key];
  if (!base) return null;
  // Anchor is restricted to a kebab/word fragment so a token can never inject
  // anything but an in-page or policy-page anchor.
  if (anchor && !/^#[a-z0-9-]+$/i.test(anchor)) return base;
  return base + anchor;
}

/**
 * Parse a policy body paragraph into an ordered list of plain-text and link
 * tokens. Pure and SSR-safe. Unknown targets degrade to plain text.
 */
export function parseInlineLinks(paragraph: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let lastIndex = 0;
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(paragraph)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: "text", text: paragraph.slice(lastIndex, match.index) });
    }
    const label = match[1].trim();
    const href = resolveHref(match[2]);
    if (href) {
      tokens.push({ kind: "link", label, href });
    } else {
      // Unknown target → render the label as plain text (never a broken link).
      tokens.push({ kind: "text", text: label });
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < paragraph.length) {
    tokens.push({ kind: "text", text: paragraph.slice(lastIndex) });
  }
  return tokens;
}

/** True if a paragraph contains at least one well-formed inline-link token. */
export function hasInlineLinks(paragraph: string): boolean {
  TOKEN.lastIndex = 0;
  return TOKEN.test(paragraph);
}
