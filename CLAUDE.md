# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Waseda Calendar (wasedacalendar.com) — a static site listing Waseda University-related events and officially recognized student circles. No framework, no bundler, no build step. Deployed as-is via GitHub Pages. `README.md` covers day-to-day content-editing instructions for the site's non-engineer owner; this file covers the architecture for making code changes.

## Commands

There is no `package.json`, no bundler, no lint config, and no test suite — this is intentional, not missing setup. Development is: edit the plain HTML/CSS/JS files directly, then verify in a browser.

- **Local server**: `.claude/launch.json` defines a `static-site` config (`.claude/static-server.ps1`, port 8743) — use the `run`/preview tooling rather than opening files via `file://`, since `events.js`/`organizations.js` fail to load over `file://`.
- **Regenerate derived static pages** after editing `events.js` or `organizations.js` (or their rendering templates):
  ```
  node scripts/generate-event-pages.js    # event/evt-XXX.html
  node scripts/generate-org-pages.js      # org/XXX.html
  node scripts/generate-sitemap.js        # sitemap.xml
  ```
  These also run automatically in CI (see Automation below) but running them locally is the only way to see the result before pushing.
- **Source-change detection**: `node scripts/check-sources.js` (mechanical hash-diff only; see Content pipeline below).

## Architecture

### Data model: two arrays are the source of truth

- `events.js` — `const EVENTS = [...]`. Full field reference lives in the file's own header comment (keep that comment current when adding fields — it is more authoritative than anything below or in README.md, which lags behind it). Notable fields beyond the obvious: `scope` (`"schedule"` vs `"circle"`, drives the top-page 学事日程/サークルイベント toggle), `weeklyClassOnly` (suppresses Sunday display for recurring class-period entries), `endDate` (multi-day bar rendering), `orgId` (links to `organizations.js` for the org's 開催実績 list once the event is past).
- `organizations.js` — `const ORGANIZATIONS = [...]`, 504 entries (482 circles, id prefixes like `A-`/`C-`/`EN-`/`ET-`, plus 22 athletic clubs under `T-`). Own header comment documents provenance (bulk-imported from the university's official circle list) and known data gaps (`nameKana` is machine-transliterated and sometimes wrong; `genre` is keyword-guessed; many `websiteUrl`/description fields are genuinely blank because most circles never submitted a listing request). The "掲載中" badge is never a manual flag — it's derived at render time from whether any event has a matching `orgId`/`relatedEventIds`.

### Every page is duplicated in two rendering paths — keep them in sync by hand

There's no shared templating, so each page type is rendered twice, independently:

1. **Client-side, at request time**: `script.js` (home page / calendar / modal), `organizations-page.js` (shared by both the org grid and org detail views), `event-page.js` / `org-page.js` (thin shells behind `event.html?id=X` / `org.html?id=X`). These read `EVENTS`/`ORGANIZATIONS` directly in the browser.
2. **Node, at build time**: `scripts/generate-event-pages.js` / `scripts/generate-org-pages.js` produce pre-rendered static files (`event/evt-XXX.html`, `org/XXX.html`) — these are the *canonical* URLs (used in sitemap, OGP, JSON-LD, share links) so that crawlers and link-preview bots that don't execute JS still see real per-item content. `script.js`'s `buildEventPageUrl()` is the single place that constructs this URL — other code should call it rather than building the path itself.

When you change how something renders (e.g. what an event card shows, how a description falls back when empty), you almost always need to change it in both the client file and the matching generator script — grep for the function name in both places before assuming one edit is enough. The generator scripts fully wipe and rebuild their output directory each run (so deleted/unpublished items don't leave stale pages behind) — always re-run them after an `events.js`/`organizations.js` edit, not just after template edits.

### Asset versioning

Every `<script src>`/`<link rel=stylesheet>` across the whole site carries a `?v=N` cache-busting query param, repeated identically on every one of the ~700 HTML files (root pages + all `event/*.html` + all `org/*.html`) plus the two generator scripts' inline templates. When you edit a shared asset (`style.css`, `organizations-page.js`, etc.), bump its version everywhere in one pass (a repo-wide find/replace on the exact `file.ext?v=N` string is the practical way — there is no single place that defines it), then regenerate the static pages so they pick up the new number too.

### Auth, reactions, and the org self-service flow

- `firebase-init.js` + `auth-ui.js`: Google sign-in (Firebase Auth) against a separate Firebase project (`wasedacalendar-login` — not the same GCP project as the org's Gmail account, see project history if that distinction matters). Firestore backs *live* per-user favorites/reactions and org-follow state via `toggleFavorite`/`getEventCounters`/etc. in `firebase-init.js`.
- This is layered on top of, not a replacement for, the legacy static `reactions` field documented in `events.js`'s header — that field is only a seed/fallback count for events with no live Firestore data yet.
- `contact.html`/`contact.js` is a self-built form (not an embedded Google Form) that POSTs to a Google Apps Script Web App (`gas/contactForm.gs`, URL in `contact.js`'s `CONTACT_GAS_URL`). Beyond new listing requests, it also implements a token-based re-auth flow for orgs that already have a listing (`lookupOrg(orgId, token)` — rate-limited GAS-side) so an org can edit their own entry without a full account system.

### Content pipeline (source-check)

`scripts/sources.json` is a registry of ~58 tracked source URLs (club/circle sites, some flagged `jsRendered: true` for sites WebFetch can't read reliably). `scripts/check-sources.js` fetches each one and does *purely mechanical* hash-diff change detection — it does not interpret content. `.github/workflows/check-sources.yml` runs this nightly (03:00 JST), commits the refreshed `sources.json` straight to `main`, and opens/updates a GitHub Issue when something changed. The actual judgment work (reading the change, deciding whether/how to update `events.js`) is deliberately *not* automated further — it's done by running the `.claude/skills/source-check/SKILL.md` skill in an interactive local session, specifically to avoid paying for a separate LLM API call. Don't build automation that calls an external paid LLM API for this project — that tradeoff has already been considered and rejected on cost grounds.

Because both this nightly workflow and local edits touch `scripts/sources.json`, expect merge conflicts there periodically — every conflict block so far has been purely "which check timestamp is newer," and the remote/newer side is always correct to keep (see `.claude/skills/source-check` and this repo's git history for the resolution pattern).

### Other generated/automated files

- `sitemap.xml`, `event/*.html`, `org/*.html` also regenerate automatically via `.github/workflows/generate-static-pages.yml` whenever `events.js` or `organizations.js` is pushed to `main` — but that only fires *after* a push, so regenerate locally too before you push if you want to see/verify the result first.
- `service-worker.js` / `pwa-install.js` / `assets/manifest.json` implement PWA install support.
- `image-generator.js` renders a shareable social-post image client-side (canvas) for a given event.

## Conventions worth knowing before editing

- Never commit or push without being explicitly asked to in that turn — this is a firm, repeatedly-stated standing instruction from the site owner, not a generic caution.
- Mobile is the primary usage mode; verify layout changes at ~320/375/390px width in addition to desktop, not just desktop.
- When event/org data fields are missing or unverifiable, prefer an honest "不明"/blank over guessing — several past incidents involved misread source tables (e.g. mixing up two similarly-named universities, or misconverting 令和 era years to 西暦) that would have shipped wrong public-facing data if not caught.
