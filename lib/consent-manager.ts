// Client-side consent manager — the real engine behind the cookie banner and
// Cookie Settings (instruction §6, ref 02 §8).
//
// Design principles enforced here:
//  - Optional categories are OFF until an explicit choice is recorded. A
//    dismissed banner does NOT count as acceptance.
//  - Choices actually gate script loading: optional scripts register through
//    this manager and only run after their category is granted; withdrawal
//    stops them (where a script exposes an unload, we call it; otherwise the
//    page is reloaded so the tracker is not re-initialized).
//  - Honesty: if there are NO optional categories, there is nothing to consent
//    to and the banner must not appear. Today the site has only necessary +
//    functional storage, so OPTIONAL_CATEGORIES is empty by design.
//
// Storage key `usam-consent` holds a versioned JSON record so a material policy
// change can invalidate a stale choice. It is itself "necessary" storage
// (remembering a legal choice), described in the Cookie Policy.

export type ConsentCategory = "necessary" | "functional" | "analytics" | "marketing";

export type OptionalCategory = Exclude<ConsentCategory, "necessary">;

export type ConsentChoice = {
  version: string;
  updatedAt: string;
  // Per optional category: true = granted, false = rejected. "necessary" is
  // always implicitly true and never stored as a toggle.
  categories: Partial<Record<OptionalCategory, boolean>>;
};

const STORAGE_KEY = "usam-consent";

// Bump when the cookie policy materially changes so stale choices re-prompt.
export const CONSENT_VERSION = "2026-02-draft-1";

/**
 * Registry of OPTIONAL technologies the site would load behind consent. EMPTY
 * today — the Master website uses only necessary/functional storage. When a
 * real analytics/marketing tag is added, register it here with its category and
 * a loader; the manager will gate it. Keeping this explicit prevents a
 * decorative banner that consents to nothing.
 */
export type OptionalTech = {
  id: string;
  category: OptionalCategory;
  label: { en: string; ar: string };
  // Loads/initializes the tech. Called only after the category is granted.
  load: () => void;
  // Optional teardown; if absent, withdrawal triggers a reload to be safe.
  unload?: () => void;
};

export const OPTIONAL_TECHS: OptionalTech[] = [
  // (none today) — see note above.
];

/**
 * Register an optional tech at runtime. Returns an unregister function. This is
 * the seam a future tracker uses, and the seam tests use to verify the gating
 * behavior WITHOUT shipping a production tracker. In production OPTIONAL_TECHS
 * stays empty unless something calls this.
 */
export function registerOptionalTech(tech: OptionalTech): () => void {
  OPTIONAL_TECHS.push(tech);
  return () => {
    const i = OPTIONAL_TECHS.indexOf(tech);
    if (i >= 0) OPTIONAL_TECHS.splice(i, 1);
  };
}

/** The optional categories that actually have at least one registered tech. */
export function activeOptionalCategories(): OptionalCategory[] {
  return Array.from(new Set(OPTIONAL_TECHS.map((t) => t.category)));
}

/** Whether there is anything optional to consent to at all. */
export function hasOptionalTech(): boolean {
  return OPTIONAL_TECHS.length > 0;
}

export function readChoice(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentChoice;
    // A choice from an older policy version is treated as absent (re-prompt).
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Whether the banner should be shown: only when optional tech exists AND the
 * user has not yet made a (current-version) choice. With no optional tech, this
 * is always false — no misleading banner.
 */
export function shouldShowBanner(): boolean {
  if (!hasOptionalTech()) return false;
  return readChoice() === null;
}

/**
 * The complete, documented inventory of browser storage this website sets. This
 * is the single source of truth the Cookie Settings UI reads, so what the user
 * sees always matches what actually exists. All three are first-party, on the
 * visitor's device, and necessary/functional — none is advertising or a
 * third-party tracker.
 */
export const STORAGE_ITEMS = [
  {
    key: "usam-locale",
    kind: "functional" as const,
    purpose: { en: "Remembers your language choice (English/Arabic).", ar: "يتذكّر اختيارك للّغة (العربية/الإنجليزية)." },
    storage: { en: "Local storage (this browser)", ar: "التخزين المحلي (هذا المتصفح)" },
    duration: { en: "Until you clear it", ar: "حتى تقوم بمسحه" },
  },
  {
    key: "usam-theme",
    kind: "functional" as const,
    purpose: { en: "Remembers your light/dark appearance choice.", ar: "يتذكّر اختيارك للمظهر الفاتح/الداكن." },
    storage: { en: "Local storage (this browser)", ar: "التخزين المحلي (هذا المتصفح)" },
    duration: { en: "Until you clear it", ar: "حتى تقوم بمسحه" },
  },
  {
    key: "usam-consent",
    kind: "necessary" as const,
    purpose: { en: "Records your cookie choice so we can honor it.", ar: "يسجّل اختيارك لملفات الارتباط لنحترمه." },
    storage: { en: "Local storage (this browser)", ar: "التخزين المحلي (هذا المتصفح)" },
    duration: { en: "Until you reset preferences or clear it", ar: "حتى تعيد ضبط التفضيلات أو تمسحه" },
  },
] as const;

/** The exact keys this site owns. Reset touches ONLY these — never other keys. */
export const USAM_STORAGE_KEYS = STORAGE_ITEMS.map((i) => i.key);

/**
 * Reset ONLY the USAM preference keys documented above. This never calls
 * localStorage.clear() — it removes a narrow, known allowlist so storage set by
 * anything else is untouched. Returns the keys actually removed.
 */
export function resetSavedPreferences(): string[] {
  if (typeof window === "undefined") return [];
  const removed: string[] = [];
  for (const key of USAM_STORAGE_KEYS) {
    try {
      if (window.localStorage.getItem(key) !== null) {
        window.localStorage.removeItem(key);
        removed.push(key);
      }
    } catch {
      /* storage disabled; nothing to remove */
    }
  }
  return removed;
}

function persist(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    /* storage disabled; choice simply not remembered */
  }
}

/** Apply a choice: load granted techs, tear down withdrawn ones. */
export function applyChoice(choice: ConsentChoice) {
  let needsReload = false;
  for (const tech of OPTIONAL_TECHS) {
    const granted = choice.categories[tech.category] === true;
    if (granted) {
      try {
        tech.load();
      } catch {
        /* a failing optional tech must not break the page */
      }
    } else if (tech.unload) {
      try {
        tech.unload();
      } catch {
        /* ignore */
      }
    } else {
      // No teardown available; if it might already be running, a reload ensures
      // a withdrawn tracker is not left initialized.
      needsReload = true;
    }
  }
  return { needsReload };
}

/** Record a decision for every optional category and apply it. */
export function setChoice(categories: Partial<Record<OptionalCategory, boolean>>): ConsentChoice {
  const choice: ConsentChoice = {
    version: CONSENT_VERSION,
    updatedAt: new Date().toISOString(),
    categories,
  };
  persist(choice);
  applyChoice(choice);
  return choice;
}

/** Accept all optional categories that have registered tech. */
export function acceptAll(): ConsentChoice {
  const categories: Partial<Record<OptionalCategory, boolean>> = {};
  for (const cat of activeOptionalCategories()) categories[cat] = true;
  return setChoice(categories);
}

/** Reject all optional categories. */
export function rejectAll(): ConsentChoice {
  const categories: Partial<Record<OptionalCategory, boolean>> = {};
  for (const cat of activeOptionalCategories()) categories[cat] = false;
  return setChoice(categories);
}

/**
 * Record the user's cookie choice as server-side consent evidence (best effort).
 * Mirrors the local choice into the consent_events table so there is an audit
 * trail, without blocking the UI if the request fails.
 */
export async function recordCookieConsentServerSide(choice: ConsentChoice, locale: string) {
  try {
    await fetch("/api/v1/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "cookie_choice",
        purpose: "site_cookies",
        policyType: "cookies",
        policyVersion: choice.version,
        locale,
        detail: choice.categories,
        // Overall status: granted if any optional category was accepted.
        status: Object.values(choice.categories).some(Boolean) ? "granted" : "denied",
      }),
    });
  } catch {
    /* evidence is best-effort; never block the user's choice */
  }
}
