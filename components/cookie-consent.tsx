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

import { useEffect, useRef, useState } from "react";
import Link from "./nav-link";
import {
  STORAGE_ITEMS,
  acceptAll,
  activeOptionalCategories,
  hasOptionalTech,
  readChoice,
  recordCookieConsentServerSide,
  rejectAll,
  resetSavedPreferences,
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
      "This website uses only necessary and functional storage — the small items listed below. There are no optional analytics, advertising, or third-party tracking technologies, so there is nothing optional to accept or reject.",
    reviewPolicy: "Read the full Cookie Policy",
    privacyPolicy: "Privacy Policy",
    on: "On",
    saved: "Preferences saved.",
    close: "Close",
    done: "Done",
    whatWeStore: "What this site stores",
    colItem: "Item",
    colPurpose: "Purpose",
    colStores: "Stored in",
    colDuration: "Kept for",
    resetBtn: "Reset saved preferences",
    resetHelp:
      "Removes only USAM's language, theme and cookie-choice entries from this browser. Nothing else is touched. Your language and theme return to the default on the next visit.",
    resetDoneSome: "Reset done. Removed:",
    resetDoneNone: "Nothing to reset — no USAM preferences are stored.",
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
      "يستخدم هذا الموقع تخزينًا ضروريًا ووظيفيًا فقط — العناصر الصغيرة المذكورة أدناه. ولا توجد تقنيات تحليلات أو إعلانات أو تتبّع من أطراف ثالثة، لذا لا يوجد اختياري لقبوله أو رفضه.",
    reviewPolicy: "اقرأ سياسة ملفات الارتباط كاملة",
    privacyPolicy: "سياسة الخصوصية",
    on: "مفعّل",
    saved: "تم حفظ التفضيلات.",
    close: "إغلاق",
    done: "تم",
    whatWeStore: "ما يخزّنه هذا الموقع",
    colItem: "العنصر",
    colPurpose: "الغرض",
    colStores: "مكان التخزين",
    colDuration: "مدة الحفظ",
    resetBtn: "إعادة ضبط التفضيلات المحفوظة",
    resetHelp:
      "يزيل فقط إدخالات يوزم الخاصة باللغة والمظهر واختيار ملفات الارتباط من هذا المتصفح. ولا يُمَس أي شيء آخر. وتعود لغتك ومظهرك إلى الوضع الافتراضي في الزيارة التالية.",
    resetDoneSome: "تمت إعادة الضبط. أُزيل:",
    resetDoneNone: "لا شيء لإعادة ضبطه — لا توجد تفضيلات ليوزم مخزّنة.",
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
export function CookieSettingsPanel({ locale, onDone }: { locale: Locale; onDone?: () => void }) {
  const L = t[locale];
  const [saved, setSaved] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const optional = hasOptionalTech();

  const doReset = () => {
    const removed = resetSavedPreferences();
    setResetMsg(removed.length ? `${L.resetDoneSome} ${removed.join(", ")}` : L.resetDoneNone);
  };

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

      {/* Honest, user-facing inventory of exactly what is stored. */}
      <h4 className="cookie-storage-title">{L.whatWeStore}</h4>
      <div className="cookie-storage-table" role="table" aria-label={L.whatWeStore}>
        <div className="cookie-storage-row cookie-storage-head" role="row">
          <span role="columnheader">{L.colItem}</span>
          <span role="columnheader">{L.colPurpose}</span>
          <span role="columnheader">{L.colStores}</span>
          <span role="columnheader">{L.colDuration}</span>
        </div>
        {STORAGE_ITEMS.map((item) => (
          <div className="cookie-storage-row" role="row" key={item.key}>
            <span role="cell"><code>{item.key}</code></span>
            <span role="cell">{item.purpose[locale]}</span>
            <span role="cell">{item.storage[locale]}</span>
            <span role="cell">{item.duration[locale]}</span>
          </div>
        ))}
      </div>

      {/* Policy links. */}
      <p className="cookie-links">
        <Link href="/cookies">{L.reviewPolicy}</Link>
        <Link href="/privacy">{L.privacyPolicy}</Link>
      </p>

      {/* Narrowly-scoped reset — only USAM's documented keys. */}
      <div className="cookie-reset">
        <button type="button" className="cookie-btn" onClick={doReset}>{L.resetBtn}</button>
        <p className="cookie-reset-help">{L.resetHelp}</p>
        {resetMsg && <p className="cookie-saved" role="status" aria-live="polite">{resetMsg}</p>}
      </div>

      {onDone && (
        <div className="cookie-done-row">
          <button type="button" className="cookie-btn cookie-btn-strong" onClick={onDone}>{L.done}</button>
        </div>
      )}
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const openit = () => setOpen(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, openit);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, openit);
  }, []);

  // While open: lock background scroll, remember the trigger to restore focus,
  // move focus into the dialog, trap Tab, and close on Escape.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const dialog = dialogRef.current;
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((el) => el.offsetParent !== null);
    // Focus the first control after mount.
    const first = focusables()[0];
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (e.key === "Tab") {
        const items = focusables();
        if (items.length === 0) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      // Restore focus to whatever opened the dialog.
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="cookie-modal-backdrop" onClick={() => setOpen(false)}>
      <div
        ref={dialogRef}
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
        <CookieSettingsPanel locale={locale} onDone={() => setOpen(false)} />
      </div>
    </div>
  );
}

/** Helper the footer uses to request opening settings. */
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
