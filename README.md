# CooldownLol.gg

A SvelteKit + Svelte 5 site that shows, for every League of Legends champion, each ability's
**cooldown**, **effect radius** and **range** — plus the per-level numbers and the full ability
description on demand.

Each champion has its own URL (`/Ashe`, `/Yasuo`, `/Miss_Fortune`) so any champion view can be
shared as a plain link. The whole site is prerendered at build time and needs no server, no API key
and no runtime network access.

## What a champion page shows

For every ability (passive plus Q/W/E/R):

| Element | Source |
| --- | --- |
| Icon and name | the wiki's ability card |
| **Cooldown** | the wiki's `COOLDOWN` row, split into per-rank pills (`18 / 14.5 / 11 / 7.5 / 4`) |
| **Effect radius** | the wiki's `EFFECT RADIUS` row (a value that shrinks with rank, such as `400 • 350`, is shown as a span, not as ranks) |
| **Range** | `TARGET RANGE` / `RANGE`; `Global` is shown verbatim |
| Support stats | cost, cast time, recharge, width, angle, speed — whatever the wiki lists for that ability |
| **Description** (collapsed) | the wiki's description, with its colour highlighting preserved, plus every per-level scaling row |

Descriptions are collapsed by default and revealed by a dropdown. They are *always present in the
served HTML* and hidden with the `hidden` attribute rather than being removed, so the content stays
crawlable and readable with JavaScript disabled.

### Matching the wiki's colours

The wiki highlights game terms in specific colours (physical damage orange, magic damage purple,
bonus attack speed yellow, AD ratios bronze, and so on). Those inline colours are mapped at build
time to semantic tokens — `hl--physical`, `hl--magic`, `hl--attack-speed`, `hl--ad-ratio`, … — and
styled in `src/app.css`. Keyword icons are replaced by compact text badges (`.kw--champion`,
`.kw--glossary`, `.kw--ability`) that keep the wiki's hover tooltip, so no images need hotlinking.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

The champion dataset is committed, so the app runs without scraping. To rebuild it from the wiki:

```bash
npm run scrape         # all 173 champions / 940 abilities; cached, resumable (~5 min cold, ~5 s warm)
npm run scrape Ashe    # just one champion (useful while changing the extractor)
npm run check          # data + formatting invariants
```

Production build (static output in `build/`):

```bash
npm run build          # vite build, then tools/postbuild.mjs annotates 404.html
npm run serve:static   # serves build/ the way a static host does, then:
npm run check:render -- http://127.0.0.1:4190
```

`npm run serve:static` exists because `vite preview` does not serve `404.html` for unknown paths, so
testing against it would never exercise the not-found path.

## Dataset size

| | |
| --- | --- |
| Champions | 173 |
| Abilities | 940 |
| With a cooldown | 747 |
| With an effect radius | 408 |
| With a range | 519 |
| With per-level scaling rows | 705 |
| Ability icons shipped | 939 |
| Prerendered pages | 175 (index, 404, and one per champion) |
| Desktop resource bundle | 42 MB, offline-complete |
| Windows release zip | ~17 MB |

## How the data is obtained

`tools/scrape.mjs` fetches the roster from
`wiki.leagueoflegends.com/en-us/List_of_champions` and then each champion's page, and extracts
structure from the **rendered** HTML.

Why the rendered page rather than the wiki's API or raw wikitext:

- The wiki's `robots.txt` disallows `api.php`, `rest.php` and every `?action=` URL. Those are
  respected — only canonical `/en-us/<Champion>` pages are fetched.
- Raw wikitext stores values as templates (`{{ap|18 to 4}}`) that only the wiki's own Lua modules
  can expand. The rendered page already contains the expanded numbers a reader sees.

Politeness: a descriptive `User-Agent`, requests spaced ~350 ms apart, three concurrent workers,
exponential backoff on `429`/`5xx`, and a large on-disk cache under `tools/.cache/` so re-runs cost
the wiki nothing.

Ability icons and champion portraits are downloaded too (about 5 MB total) and rewritten to stable
local paths under `static/icons/`, because the wiki's image URLs carry content hashes and are not
reliable to hotlink.

Properties such as *"does Ashe's Q have a cooldown?"* are read from the page, not assumed: Ashe's
Ranger's Focus genuinely lists no cooldown, and Yasuo's Steel Tempest lists an attack-speed-scaled
one. Both are rendered faithfully instead of being forced into a "cooldown: N" template.

## Layout

```
src/
  app.css                     design tokens, base layer, wiki highlight colours
  app.html                    document shell
  lib/
    data/champions.json       the generated dataset (committed)
    champions.js              lookup, canonical URL, search ranking
    ability.js                which stats are headline numbers vs. detail
    format.js                 rank pills, label formatting (pure, unit-tested)
    components/
      AbilityCard.svelte      icon, headline stats, description dropdown
      Description.svelte      renders generated wiki HTML
      StatValue.svelte        cooldown / radius / range display
      ChampionSearch.svelte   client-side search over the bundled roster
  routes/
    +layout.svelte            header, footer, licence notices
    +page.svelte              search all champions (reads the dataset directly)
    [champion]/+page.js       resolves the URL segment to a champion (404 otherwise)
    [champion]/+page.svelte   the champion view
    +error.svelte             not-found page
neutralino/
  neutralino.config.json      generated shell config (window, paths, permissions)
  resources/appIcon.ico       app icon, bundled into resources.neu
  resources/app/              staged frontend (generated)
  bin/                        Neutralino runtimes, all platforms (generated, gitignored)
  dist/                       packaged app + release zip (generated, gitignored)
tools/
  lib/html.js                 dependency-free HTML tree parser
  lib/extract.js              wiki page -> structured champion (all parsing rules)
  lib/zip.js                  minimal ZIP reader, for verifying release artifacts
  scrape.mjs                  roster + per-champion fetch, icon download, caching
  check-data.mjs              integrity checks over the dataset
  check-format.mjs            unit checks for the presentation helpers
  check-render.mjs            end-to-end checks against a built site (web or desktop)
  check-desktop.mjs           packaging checks for the Neutralino app
  neutralino/adapter.js       restages the web build for Neutralino's resolution rules
  serve-static.mjs            static host with 404.html fallback (for check-render)
  postbuild.mjs               adds a noscript champion list to the 404 fallback
  probe.js                    dev aid: dump one champion's ability DOM
```

Parsing lives entirely in `tools/lib/extract.js` and presentation entirely in `src/lib`, so a wiki
markup change is fixed in one file and never touches the UI.

## Deployment

Live at **[lolcooldown-gg.pages.dev](https://lolcooldown-gg.pages.dev)** on Cloudflare Pages, with the
source at **[github.com/leocrapart-pixel/LolCooldown.gg](https://github.com/leocrapart-pixel/LolCooldown.gg)**.

`build/` is a plain folder of static files, so any static host works. Cloudflare Pages is deployed
by direct upload:

```bash
npm run build
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
  npx wrangler pages deploy build --project-name=lolcooldown-gg --branch=main
```

The Pages project is `lolcooldown-gg`, production branch `main`. Deploys are currently **manual**
(pushing to GitHub does not trigger a build) — connecting the repo for automatic deploys needs a
GitHub App authorisation through the Cloudflare dashboard, which a scoped API token cannot do.

> Asset paths must stay root-relative (`kit.paths.relative = false`). Champion pages are flat files
> served at `/Ashe` with no trailing slash, so SvelteKit's default `./_app/...` paths resolve against
> `/Ashe` and 404 — the site then renders with no CSS and no JavaScript. `check-render.mjs` asserts
> this by fetching every referenced asset and checking its status and Content-Type.

## Sharing a champion link, and mis-cased URLs

Canonical URLs use the champion's own casing (`/Ashe`, `/Miss_Fortune`) and every link the site
generates uses them. A static host serves one file per path, so `/ashe` is not rewritten by the
server and lands on the 404 fallback.

With JavaScript the error page runs and sends a single-segment path whose champion exists in another
casing to the canonical URL. Without JavaScript, `tools/postbuild.mjs` injects a `<noscript>` block
listing all 173 champions, so the URL is still a useful page rather than a blank one. `<noscript>` is
used deliberately — browsers never hydrate inside it, so this cannot cause a hydration mismatch.

## Desktop app (Neutralinojs)

The same frontend ships as a Windows desktop app. `/Ashe` is a real page in a native window with no
browser chrome and no server to run.

```bash
npm run desktop:update    # once: fetch the Neutralino runtime binaries (~22 MB, gitignored)
npm run build:desktop     # web build -> staged resources -> neutralino/dist/cooldownlol-release.zip
npm run desktop:run       # run it locally (needs GTK/WebKit on Linux, WebView2 on Windows)
```

Published for download: **[CooldownLol.gg v1.0.0 — Windows desktop](https://github.com/leocrapart-pixel/LolCooldown.gg/releases/tag/v1.0.0)**.

`npm run build:desktop` writes `neutralino/dist/cooldownlol-release.zip` (~17 MB) with every
platform's runtime, and `npm run package:desktop` then narrows that to a per-platform zip containing
only `cooldownlol.exe` (a 64-bit Windows GUI executable) plus `resources.neu` — the whole app,
offline — at 9.8 MB instead of 16.6 MB. That smaller zip is the release asset.

To ship a version: `npm run build:desktop && npm run package:desktop`, then upload
`neutralino/dist/cooldownlol-win_x64.zip` to a GitHub release. Extract it and run the `.exe`;
WebView2 ships with Windows 11 and current Windows 10.

### Why a desktop build is not just "reuse `build/`"

Neutralino serves the frontend from its own local HTTP server and decides *file or directory* by
whether the path contains a dot. From `server/router.cpp`:

```cpp
vector<string> split = helpers::split(path, '.');
if (split.size() < 2) {                       // no dot -> treat as a directory
    if (path.back() != '/') path += "/";
    return getAsset(path + "index.html", ...);
}
```

So `/Ashe` resolves to `Ashe/index.html` and **never** finds a flat `Ashe.html` — which is exactly how
the web build lays out its prerendered pages. `tools/neutralino/adapter.js` therefore restages the
build: it copies the web output, then mirrors every flat page into directory form (`Ashe.html` →
`Ashe/index.html`), keeping both shapes so the same output also satisfies a host that prefers the
other convention.

Two further desktop-specific decisions, both encoded as checks:

- **Navigation is a full page load.** `src/app.html` sets `data-sveltekit-preload-data="off"`, so the
  client router does not intercept links. A route change would make SvelteKit request
  `/Ashe/__data.json`, which a static build never emits — verified: it 404s. Every page exists as a
  real file, so a full load always resolves. The index route also reads the dataset directly instead
  of through a `load` function, so it has no server data dependency.
- **Icons and the client library live inside the document root**, because only `documentRoot` is
  mapped to `/`; a file outside it cannot be fetched by the local server.

The web app is untouched by all of this. The adapter consumes `build/` strictly as a copy *source* —
asserted by `check-desktop.mjs`, which parses the adapter and fails if `WEB_BUILD` ever appears as a
write destination — and the shipped web bundle contains no Neutralino markup
(verified: zero occurrences across all 1,300+ files).

> Asset paths stay root-relative (`kit.paths.relative = false`) for both targets: Neutralino has a
> real HTTP server, so absolute paths are correct there too.

## Verification

```bash
npm run check                                   # data + format + desktop invariants
npm run build                                   # then:
npm run serve:static                            # serves build/ with 404.html fallback
npm run check:render -- http://127.0.0.1:4190   # 82 end-to-end assertions

npm run serve:static 4190 neutralino/resources/app   # same checks on the desktop tree
```

Current totals: **50,764 data checks** across 173 champions / 940 abilities, 21 formatting checks,
**82 render checks**, and **40 desktop checks**. The render suite passes unchanged against both the
web build and the staged desktop resource tree.

`check-data.mjs` asserts the properties that must hold for the site to be correct — every champion
has a passive and Q/W/E/R, every ability has a description, icons resolve to files that exist, and
each rendered description *reads the same as the text it was generated from* (which is what catches
lost spaces between inline elements). Exact numbers are deliberately not asserted there, because
they change every patch; `check-render.mjs` pins the published Ashe values instead, and checks that
Yasuo's attack-speed-scaled cooldown survives verbatim.

`check-desktop.mjs` verifies the packaging facts that decide whether the app can work at all: that
all 173 champion URLs resolve to `<slug>/index.html` under Neutralino's resolution rule, that assets
are root-relative and present, that the window opens on the app with no unnecessary native
permissions, and — if a release zip exists — that it contains a real PE32+ x86-64 GUI executable and
a `resources.neu` holding the mirrored pages.

Three real bugs were caught only by running the checks over the full roster rather than a sample:
variant abilities (Kha'Zix's evolutions, Karma's Mantra forms) were dropped, Hwei's fifteen
sub-abilities collapsed into a single card, and the wiki's hidden alternate phrasings leaked into
plain text. Every one of them is now covered by an invariant.

## Notes and limits

- **The Windows executable has not been run.** This environment has no Windows, no Wine, and no GTK
  for the Linux runtime, so the packaging is verified by inspecting the artifacts (PE headers,
  subsystem, archive contents, page resolution) rather than by launching the app. `npm run
  desktop:run` on a real desktop is the remaining check.
- The desktop build currently produces all platforms' binaries in the zip because `neu build`
  bundles every runtime. Pruning to Windows only would mean shipping a narrower `resourcesPath`.
- Numbers change between patches. The dataset records the patch each page reported, and the wiki
  page remains the authoritative source; every champion page links to it.
- Variable/scaling values (Yasuo's Steel Tempest cooldown, for instance) are shown verbatim rather
  than being flattened into a single number.
- Grouped abilities are presented as a parent entry plus one entry per alternate form, indented and
  labelled (`Ability Q · alternate form`, `Part of Subject: Disaster`). Rank keys apply to the parent.
- Icons are downloaded and served locally so the site has no third-party requests at runtime; wiki
  content is CC BY-SA 3.0 and is attributed in the site footer.
- CooldownLol.gg isn't endorsed by Riot Games.
- This environment has no browser, so layout and the description dropdown were verified structurally
  (the checks assert the markup, the collapsed state and the values) rather than visually.

## Archived: the previous Bush Stats app

This workspace previously held "Bush Stats", a Riot API match-history viewer. Its source has been
moved aside to `_legacy-bush-stats/` (client components, server, smoke tests, `.env.example`). It is
not part of this app and is not built by it.

Note: this README replaced the one that documented that app, and there is no git history in this
workspace to recover it from. `_legacy-bush-stats/` still holds the code, but its README is gone.
