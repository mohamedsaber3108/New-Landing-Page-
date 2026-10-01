# USAM Master Ecosystem — complete source

This is the full source of the Master website: the landing page, 18 information routes, shared navigation, official supplied logo assets, English/Arabic content, RTL, green dark mode, interactive journey, examples, and the platform-finding guide.

## Run locally

Use Node.js 24 LTS (at least 22.13). In this folder:

```bash
npm ci
npm run dev
```

Open the local address printed by the development command. The project uses React, TypeScript, Vinext, Vite, and a Cloudflare-compatible production output. It is not a plain Next.js build; preserve the supplied scripts and lockfile.

```bash
npx tsc --noEmit
npm run build
npm start
```

The local execution profile is intentionally not included in the download. The scripts default to the portable profile outside the hosted development environment.

## Main files

- `components/usam-site.tsx`: shared navigation, preserved hero, footer, locale/theme preferences, page routing surface.
- `components/research-landing.tsx`: connected journey, product chapters, interactive examples, FAQ, final CTA, accessible guide dialog.
- `app/research-landing.css`: research-led design, responsive layout, purposeful motion and reduced-motion alternatives.
- `app/globals.css`: existing USAM theme and information-page styles.
- `lib/guide-intent.ts`: local bilingual intent routing with clarification and unknown states.
- `data/products.ts`: product destinations and route catalogue.
- `components/page-content.tsx`: bilingual content for all existing information pages.
- `public/brand/`: supplied official logo files. The existing favicon is preserved.

## What is functional here

- Direct navigation to all four product destinations and all existing information pages.
- Three journey scenarios with selectable stages and desktop scroll-linked emphasis.
- Learning question and coding-logic activity with local feedback.
- CV/interview examples and client/independent freelance roles.
- Expandable product features and FAQs.
- Local bilingual guide routing, clarification, reset, accessible dialog focus and keyboard close.
- Language and theme preferences saved only in this browser.

## Product boundaries

The guide is NOT a connected AI chatbot. It sends no requests to an AI service and does not save the visitor's message. Learning and career examples are labelled illustrations, not authenticated product screenshots or genuine user records. External platforms have their own accounts, plans, and terms; no cross-platform identity, data sync, job guarantee, or payment integration is implied.

The external Education, Career, Freelancing, and Kids applications are linked services. Their own source code/backends are not included in this Master website repository. No API keys, tokens, `.env` files, dependency folders, or build caches are included in the ZIP.

## Research implementation

The implementation preserves the established hero and green identity. The primary change is to explain connected value through a goal, a relevant experience, and a next step. Kids remains a separate learning journey. Client and independent needs are distinguished. Native scrolling, semantic HTML, optional disclosures, SVG icons, and CSS transitions provide the experience without a heavy 3D runtime.

## Verification

TypeScript validation, English/Arabic guide routing scenarios, and the production build are checked before publication. Source/render checks do not substitute for a full visual browser accessibility or device audit. No complete cross-device visual certification is claimed.
