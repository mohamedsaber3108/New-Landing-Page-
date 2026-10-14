// Renders the built-in policy baselines (lib/legal/policies.ts) into a single
// human-readable bilingual Markdown document for legal review. Read-only; does
// NOT publish anything. The authoritative source stays lib/legal/policies.ts.
//
// Usage: node scripts/export-policy-drafts.mjs > docs/USAM-legal-policy-drafts.md

import { readFileSync } from "node:fs";

// The policies module is TS; rather than compile it, we parse the structured
// data we need via a tiny TS->JS shim using a dynamic import of a built copy is
// overkill here. Instead, import through the Node TS loader if available; if
// not, fall back to a regex-light extraction is fragile. Simplest robust path:
// import the compiled dist if present, else evaluate via tsx. We attempt a
// dynamic import of the source using Node's native TS stripping (Node >= 22.6
// with --experimental-strip-types), which this host supports (Node 26).

const mod = await import("../lib/legal/policies.ts");
const {
  POLICIES,
  LEGAL_CENTER_ORDER,
  LEGAL_FRAMEWORKS,
  BASE_CURRENCY,
  RESPONSIBLE_CONTACT,
  BASELINE_VERSION,
} = mod;

const lines = [];
const w = (s = "") => lines.push(s);

w(`# USAM Master — Legal Policy Drafts (for review)`);
w();
w(`> **Status: DRAFT — not published.** This document is the full provisional`);
w(`> text of every Master-site policy, in English and Arabic, for legal review.`);
w(`> It is generated from \`lib/legal/policies.ts\` (baseline version`);
w(`> \`${BASELINE_VERSION}\`). The live site does NOT display this text: public`);
w(`> pages show a neutral "being finalized" notice until an approved version is`);
w(`> published through the admin API. Nothing here is binding.`);
w();
w(`> The Master website (usamif.com) is a **discovery and enquiry portal**: it`);
w(`> presents the ecosystem, collects enquiries, and routes visitors to the`);
w(`> platforms. It does **not** sell products, take payment, or create accounts.`);
w(`> Each policy below is written to describe exactly that role.`);
w();
w(`Base currency for USAM-owned pricing: **${BASE_CURRENCY}**.`);
w();
w(`Responsible operator (to be confirmed before publication):`);
w(`- Trading name: ${RESPONSIBLE_CONTACT.operatorDisplayName}`);
w(`- Registered legal name (EN): ${RESPONSIBLE_CONTACT.legalEntity}`);
w(`- Registered legal name (AR): ${RESPONSIBLE_CONTACT.legalEntityAr}`);
w(`- Registered address (EN): ${RESPONSIBLE_CONTACT.address}`);
w(`- Registered address (AR): ${RESPONSIBLE_CONTACT.addressAr}`);
w(`- Commercial registration no.: ${RESPONSIBLE_CONTACT.registrationNumber || "[FOR REVIEW — optional, omit if not published]"}`);
w(`- Privacy contact email: ${RESPONSIBLE_CONTACT.privacyEmail}`);
w(`- Contact label: ${RESPONSIBLE_CONTACT.contactLabel} (not an assertion that a DPO is formally appointed)`);
w();
w(`## Applicable data-protection frameworks`);
for (const f of LEGAL_FRAMEWORKS) {
  w(`- **${f.jurisdiction.en}** — ${f.law.en} ${f.note.en}`);
}
w();
w(`---`);
w();

for (const type of LEGAL_CENTER_ORDER) {
  const p = POLICIES[type];
  w(`# ${p.title.en}  ·  ${p.title.ar}`);
  w();
  w(`- Route: \`${p.path}\``);
  w(`- Version: \`${p.version}\`  ·  Approval: \`${p.approval}\`  ·  Effective: ${p.effectiveAt ?? "— (not yet effective)"}`);
  w(`- Scope (EN): ${p.scope.en}`);
  w(`- النطاق (AR): ${p.scope.ar}`);
  w(`- Applies to (EN): ${p.appliesTo.en}`);
  w(`- ينطبق على (AR): ${p.appliesTo.ar}`);
  w();
  w(`## English`);
  for (const s of p.sections) {
    w(`### ${s.en.heading}`);
    for (const para of s.en.body) w(para), w();
  }
  w(`## العربية`);
  for (const s of p.sections) {
    w(`### ${s.ar.heading}`);
    for (const para of s.ar.body) w(para), w();
  }
  w(`---`);
  w();
}

process.stdout.write(lines.join("\n"));
