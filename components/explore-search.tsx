"use client";

import { useEffect, useRef, useState } from "react";

type Locale = "en" | "ar";

type SearchResult = {
  id: string;
  type: "product" | "capability";
  productId: string;
  title: string;
  summary: string;
  destination: string;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; results: SearchResult[]; query: string };

const t = {
  en: {
    label: "Search by goal, product, or skill",
    placeholder: "Try coding, jobs, talent, courses…",
    searching: "Searching…",
    empty: "No matches. Try a broader term.",
    error: "Search is unavailable right now. Please try again.",
    open: "Open",
    results: "Results",
  },
  ar: {
    label: "ابحث بالهدف أو المنتج أو المهارة",
    placeholder: "جرّب: برمجة، وظائف، مواهب، دورات…",
    searching: "جارٍ البحث…",
    empty: "لا توجد نتائج. جرّب كلمة أعمّ.",
    error: "البحث غير متاح الآن. حاول مرة أخرى.",
    open: "افتح",
    results: "النتائج",
  },
} as const;

/**
 * Progressive-enhancement search for /explore. Calls GET /api/v1/search with a
 * short debounce and renders loading / error / empty / results states. The page
 * remains usable if the request fails (honest error, not a blank screen).
 */
export function ExploreSearch({ locale }: { locale: Locale }) {
  const L = t[locale];
  const [query, setQuery] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) {
      setState({ kind: "idle" });
      return;
    }
    debounce.current = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        const params = new URLSearchParams({ q, locale, limit: "12" });
        const res = await fetch(`/api/v1/search?${params.toString()}`);
        const json = (await res.json().catch(() => null)) as
          | { data?: { results: SearchResult[] }; error?: { message: string } }
          | null;
        if (res.ok && json?.data) {
          setState({ kind: "ready", results: json.data.results, query: q });
        } else {
          setState({ kind: "error", message: json?.error?.message ?? L.error });
        }
      } catch {
        setState({ kind: "error", message: L.error });
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, locale, L.error]);

  return (
    <div className="explore-search">
      <label className="product-search">
        {L.label}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={L.placeholder}
          type="search"
          aria-label={L.label}
        />
      </label>

      {state.kind === "loading" && (
        <p className="explore-status" role="status">{L.searching}</p>
      )}
      {state.kind === "error" && (
        <p className="explore-status explore-error" role="alert">{state.message}</p>
      )}
      {state.kind === "ready" && state.results.length === 0 && (
        <p className="explore-status" role="status">{L.empty}</p>
      )}
      {state.kind === "ready" && state.results.length > 0 && (
        <section aria-label={L.results}>
          <div className="explore-results">
            {state.results.map((r) => (
              <article key={r.id} className="explore-result">
                <span className="explore-result-type">{r.type}</span>
                <h3>{r.title}</h3>
                <p>{r.summary}</p>
                <a className="product-link compact" href={r.destination} target="_blank" rel="noreferrer">
                  {L.open}
                </a>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
