"use client";

import { useEffect, useId, useRef } from "react";
import { ChevronDown } from "lucide-react";
import Link from "./nav-link";
import { MENU_BY_ID, MENU_UI, SECTION_ICONS, type MenuSection } from "./nav-menu-data";

type Locale = "en" | "ar";

/**
 * One desktop navbar item with a mega-menu.
 *
 * - The top-level LABEL is a real <a href> (plain anchor) that always navigates
 *   — the menu never blocks normal navigation.
 * - A SEPARATE chevron <button> toggles the menu for click/keyboard/touch.
 * - On desktop, hovering the item opens the menu after a short delay; leaving
 *   it closes after a grace period so the pointer can travel into the panel.
 * - Only one menu is open at a time (coordinated by the parent via openId).
 */
export function NavMenu({
  section,
  label,
  locale,
  openId,
  setOpenId,
  hoverEnabled,
}: {
  section: MenuSection["id"];
  label: string;
  locale: Locale;
  openId: string | null;
  setOpenId: (id: string | null) => void;
  hoverEnabled: boolean;
}) {
  const ar = locale === "ar";
  const data = MENU_BY_ID[section];
  const SectionIcon = SECTION_ICONS[section];
  const ui = MENU_UI[locale];
  const panelId = useId();
  const open = openId === section;

  const rootRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  };

  const scheduleOpen = () => {
    if (!hoverEnabled) return;
    clearTimers();
    openTimer.current = setTimeout(() => setOpenId(section), 120); // small opening delay
  };
  const scheduleClose = () => {
    if (!hoverEnabled) return;
    clearTimers();
    closeTimer.current = setTimeout(() => {
      // Only close if focus isn't still inside this item.
      if (!rootRef.current?.contains(document.activeElement)) setOpenId(null);
    }, 220); // closing grace period
  };

  useEffect(() => () => clearTimers(), []);

  return (
    <div
      ref={rootRef}
      className="nav-menu"
      data-open={open ? "true" : "false"}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
    >
      <Link href={data.href} className="nav-menu-label">
        <SectionIcon size={15} />
        <span>{label}</span>
      </Link>
      <button
        type="button"
        className="nav-menu-chevron"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${label} — ${open ? ui.close : ui.more}`}
        onClick={() => setOpenId(open ? null : section)}
        onMouseEnter={scheduleOpen}
      >
        <ChevronDown size={14} aria-hidden="true" />
      </button>

      <div
        id={panelId}
        className="nav-menu-panel"
        role="menu"
        aria-label={label}
        hidden={!open}
        dir={ar ? "rtl" : "ltr"}
        onMouseEnter={clearTimers}
        onMouseLeave={scheduleClose}
      >
        <ul>
          {data.links.map((link) => {
            const Icon = link.icon;
            const copy = ar ? link.ar : link.en;
            return (
              <li key={`${link.href}-${copy.title}`} role="none">
                <Link
                  role="menuitem"
                  href={link.href}
                  className="nav-menu-item"
                  {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  onClick={() => setOpenId(null)}
                >
                  <span className="nav-menu-item-icon"><Icon size={18} /></span>
                  <span className="nav-menu-item-text">
                    <span className="nav-menu-item-title">
                      {copy.title}
                      {link.external && <span className="sr-only">{ui.opensNewTab}</span>}
                    </span>
                    <span className="nav-menu-item-desc">{copy.desc}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/**
 * Mobile accordion section for one nav item. The top-level label is still a
 * real anchor; a separate chevron button expands the sub-links. No hover.
 */
export function MobileNavSection({
  section,
  label,
  locale,
  expanded,
  setExpanded,
  onNavigate,
}: {
  section: MenuSection["id"];
  label: string;
  locale: Locale;
  expanded: boolean;
  setExpanded: (id: string | null) => void;
  onNavigate: () => void;
}) {
  const ar = locale === "ar";
  const data = MENU_BY_ID[section];
  const SectionIcon = SECTION_ICONS[section];
  const ui = MENU_UI[locale];
  const panelId = useId();

  return (
    <div className="mobile-nav-section" data-open={expanded ? "true" : "false"}>
      <div className="mobile-nav-row">
        <Link href={data.href} className="mobile-nav-head" onClick={onNavigate}>
          <SectionIcon size={17} />
          <span>{label}</span>
        </Link>
        <button
          type="button"
          className="mobile-nav-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={`${label} — ${expanded ? ui.close : ui.more}`}
          onClick={() => setExpanded(expanded ? null : section)}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      <ul id={panelId} className="mobile-nav-sublist" hidden={!expanded}>
        {data.links.map((link) => {
          const Icon = link.icon;
          const copy = ar ? link.ar : link.en;
          return (
            <li key={`${link.href}-${copy.title}`}>
              <Link
                href={link.href}
                className="mobile-nav-sublink"
                {...(link.external ? { target: "_blank", rel: "noreferrer" } : {})}
                onClick={onNavigate}
              >
                <Icon size={16} />
                <span>
                  <span className="mobile-nav-sub-title">{copy.title}</span>
                  <span className="mobile-nav-sub-desc">{copy.desc}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
