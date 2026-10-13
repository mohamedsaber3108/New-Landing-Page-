"use client";

// Cookie consent UI (instruction §6, ref 02 §8).
//
//  - CookieConsent: the compact banner. It renders ONLY when there is optional
//    tech to consent to AND no current choice exists. Today the site has no
//    optional trackers, so the banner does not appear — by design, not an
//    oversight. The code path is fully built so adding a tracker to
//    OPTIONAL_TECHS turns the banner on with equal Accept all / Reject /
//    Customize controls that actually gate loading.
//  - CookieSettingsPanel: always-available controls (embedded in the Cookie
//    Policy page and reachable from the footer "Cookie Settings" link). It
//    honestly reports when only necessary/functional storage is in use.
//
// Accessible (focusable controls, no dark patterns — reject is as prominent as
// accept), bilingual, RTL-aware via logical CSS, theme-aware via tokens. The
// banner sits above content but is positioned so it does not cover Ask USAM.

import { useEffect, useState } from "react";
import {
  CONSENT_VERSION,
  OPTIONAL_TECHS,
  acceptAll,
  activeOptionalCategories,
  hasOptionalTech,
  readChoice,
  recordCookieConsentServerSide,
  rejectAll,
  setChoice,
  shouldShowBanner,
  type ConsentChoice,
  type OptionalCategory,
} from "@/lib/consent-manager";

type Locale = "en" | "ar";

/** Custom event the footer dispatches to reopen Cookie Settings anywhere. */
export const OPEN_COOKIE_SETTINGS_EVENT = "usam:open-cookie-settings";

const t = {
  en: {
    bannerTitle: "Your cookie choices",
    bannerBody:
      "We use necessary storage to run this site. Optional technologies are off until you choose. You can change this anytime from Cookie Settings in the footer.",
    acceptAll: "Accept all optional",
    reject: "Reject optional",
    customize: "Customize",
    save: "Save preferences",
    settingsTitle: "Cookie Settings",
    necessary: "Necessary & functional",
    necessaryBody:
      "Always on. Remembers your language, theme, and your cookie choice. Not used for advertising, and never sent to a third-party tracker.",
    onlyNecessary:
      "This website currently uses only necessary and functional storage. There are no optional analytics or marketing technologies to turn on, so there is nothing optional to accept or reject here.",
    reviewPolicy: "Read the full Cookie Policy",
    on: "On",
    saved: "Preferences saved.",
    close: "Close",
  },
  ar: {
    bannerTitle: "اختياراتك لملفات الارتباط",
    bannerBody:
      "نستخدم تخزينًا ضروريًا لتشغيل الموقع. والتقنيات الاختيارية متوقفة حتى تختار. ويمكنك تغيير ذلك في أي وقت من «إعدادات ملفات الارتباط» في التذييل.",
    acceptAll: "قبول كل الاختياري",
    reject: "رفض الاختياري",
    customize: "تخصيص",
    save: "حفظ التفضيلات",
    settingsTitle: "إعدادات ملفات الارتباط",
    necessary: "ضروري ووظيفي",
    necessaryBody:
      "مفعّل دائمًا. يتذكّر لغتك ومظهرك واختيارك لملفات الارتباط. ولا يُستخدم للإعلانات، ولا يُرسل إلى أداة تتبّع من طرف ثالث.",
    onlyNecessary:
      "يستخدم هذا الموقع حاليًا تخزينًا ضروريًا ووظيفيًا فقط. ولا توجد تقنيات تحليلات أو تسويق اختيارية لتفعيلها، لذا لا يوجد اختياري لقبوله أو رفضه هنا.",
    reviewPolicy: "اقرأ سياسة ملفات الارتباط كاملة",
    on: "مفعّل",
    saved: "تم حفظ التفضيلات.",
    close: "إغلاق",
  },
} as const;

const categoryLabels: Record<OptionalCategory, { en: string; ar: string }> = {
  functional: { en: "Functional", ar: "وظيفي" },
  analytics: { en: "Analytics", ar: "تحليلات" },
  marketing: { en: "Marketing", ar: "تسويق" },
};

/** The compact banner — shown only when there is optional tech and no choice. */
export function CookieConsent({ locale }: { locale: Locale }) {
  const L = t[locale];
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);

  useEffect(() => {
    // shouldShowBanner() reads localStorage, which is unavailable during SSR,
    // so the decision is made after mount. Today this is always false (no
    // optional trackers) — the banner stays hidden, honestly.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(shouldShowBanner());
  }, []);

  if (!visible) return null;

  const decide = async (choice: ConsentChoice) => {
    await recordCookieConsentServerSide(choice, locale);
    setVisible(false);
  };

  return (
    <div className="cookie-banner" role="dialog" aria-modal="false" aria-label={L.bannerTitle} dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="cookie-banner-inner">
        <div className="cookie-banner-text">
          <strong>{L.bannerTitle}</strong>
          <p>{L.bannerBody}</p>
        </div>
        {!customizing ? (
          <div className="cookie-banner-actions">
            <button type="button" className="cookie-btn cookie-btn-strong" onClick={() => decide(acceptAll())}>
              {L.acceptAll}
            </button>
            <button type="button" className="cookie-btn cookie-btn-strong" onClick={() => decide(rejectAll())}>
              {L.reject}
            </button>
            <button type="button" className="cookie-btn" onClick={() => setCustomizing(true)}>
              {L.customize}
            </button>
          </div>
        ) : (
          <CategoryToggles
            locale={locale}
            onSave={(cats) => decide(setChoice(cats))}
            saveLabel={L.save}
          />
        )}
      </div>
    </div>
  );
}

/** Per-category toggles used by both the banner "Customize" view and settings. */
function CategoryToggles({
  locale,
  onSave,
  saveLabel,
}: {
  locale: Locale;
  onSave: (cats: Partial<Record<OptionalCategory, boolean>>) => void;
  saveLabel: string;
}) {
  const cats = activeOptionalCategories();
  const existing = readChoice();
  const [state, setState] = useState<Partial<Record<OptionalCategory, boolean>>>(() => {
    const init: Partial<Record<OptionalCategory, boolean>> = {};
    for (const c of cats) init[c] = existing?.categories[c] ?? false;
    return init;
  });

  return (
    <div className="cookie-toggles">
      {cats.map((c) => (
        <label key={c} className="cookie-toggle">
          <input
            type="checkbox"
            checked={state[c] === true}
            onChange={(e) => setState((s) => ({ ...s, [c]: e.target.checked }))}
          />
          <span>{categoryLabels[c][locale]}</span>
        </label>
      ))}
      <button type="button" className="cookie-btn cookie-btn-strong" onClick={() => onSave(state)}>
        {saveLabel}
      </button>
    </div>
  );
}

/**
 * Always-available settings surface. Embedded in the Cookie Policy page and
 * opened from the footer. Reports honestly when only necessary storage exists.
 */
export function CookieSettingsPanel({ locale }: { locale: Locale }) {
  const L = t[locale];
  const [saved, setSaved] = useState(false);

  const optional = hasOptionalTech();

  return (
    <div className="cookie-settings" id="cookie-settings">
      <h3>{L.settingsTitle}</h3>
      <div className="cookie-category cookie-category-locked">
        <div>
          <strong>{L.necessary}</strong>
          <p>{L.necessaryBody}</p>
        </div>
        <span className="cookie-locked-pill">{L.on}</span>
      </div>

      {optional ? (
        <CategoryToggles
          locale={locale}
          saveLabel={L.save}
          onSave={async (cats) => {
            const choice = setChoice(cats);
            await recordCookieConsentServerSide(choice, locale);
            setSaved(true);
          }}
        />
      ) : (
        <p className="cookie-only-necessary" role="note">
          {L.onlyNecessary}
        </p>
      )}

      {saved && (
        <p className="cookie-saved" role="status" aria-live="polite">
          {L.saved}
        </p>
      )}
      <p className="cookie-version">
        <bdi>
          {OPTIONAL_TECHS.length} optional · v{CONSENT_VERSION}
        </bdi>
      </p>
    </div>
  );
}

/**
 * A modal wrapper that opens the settings panel in response to the footer's
 * "Cookie Settings" link, so users can reopen and change choices from anywhere.
 */
export function CookieSettingsModal({ locale }: { locale: Locale }) {
  const L = t[locale];
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openit = () => setOpen(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openit);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openit);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="cookie-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        className="cookie-modal"
        role="dialog"
        aria-modal="true"
        aria-label={L.settingsTitle}
        dir={locale === "ar" ? "rtl" : "ltr"}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="cookie-modal-close" onClick={() => setOpen(false)} aria-label={L.close}>
          ×
        </button>
        <CookieSettingsPanel locale={locale} />
      </div>
    </div>
  );
}

/** Helper the footer uses to request opening settings. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
