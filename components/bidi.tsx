import { Fragment, type ReactNode } from "react";

// Runs of Latin letters/digits (with inner spaces, dots, dashes) such as
// "USAM-XXXXXX", "Google Workspace" or "500".
const LTR_RUN = /[A-Za-z0-9](?:[A-Za-z0-9 .\-+&/@]*[A-Za-z0-9])?/g;
const ARABIC = /[\u0600-\u06FF]/;

/**
 * In Arabic text, wrap each English word/number run in <bdi lang="en"> so the
 * bidi algorithm cannot reorder it with nearby punctuation. Text with no
 * Arabic letters is returned unchanged.
 */
export function isolateLtr(text: string): ReactNode {
  if (!ARABIC.test(text)) return text;
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(LTR_RUN)) {
    const start = match.index ?? 0;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      /\D/.test(match[0]) ? (
        <bdi key={start} lang="en">{match[0]}</bdi>
      ) : (
        <bdi key={start}>{match[0]}</bdi>
      ),
    );
    last = start + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <Fragment>{out}</Fragment>;
}
