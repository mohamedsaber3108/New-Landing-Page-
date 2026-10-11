"use client";

// Plain-anchor replacement for next/link used across the USAM site shell.
//
// Why: on this deployment, next/link's client-side router did not navigate when
// clicked (nav links were inert whenever client hydration was incomplete).
// A real <a href> performs an ordinary browser navigation that works regardless
// of hydration state. This component forwards className, onClick, target, rel,
// aria-* and all other anchor attributes, so existing styling and behavior are
// preserved — it is a drop-in for the subset of next/link features this app uses
// (string hrefs for internal pages). Interactive, JS-only controls (Ask USAM,
// language/theme toggles) are <button> elements and are unaffected.

import type { AnchorHTMLAttributes, ReactNode } from "react";

type LinkProps = { href: string; children?: ReactNode } & Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>;

export default function Link({ href, children, ...rest }: LinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}
