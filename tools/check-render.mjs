/**
 * End-to-end render checks against the built site.
 *
 *   npm run build
 *   npx vite preview --port 4180 &
 *   node tools/check-render.mjs http://127.0.0.1:4180
 *
 * These assert what a reader actually receives: the ability card structure, the
 * headline numbers the site promises (cooldown, effect radius, range), the
 * per-level pills, and the collapsible description with its wiki highlight
 * markup present in the HTML rather than only after a click.
 *
 * The expected values are the ones published on the League of Legends Wiki for
 * Ashe, so this doubles as a check that extraction still matches the source.
 */
const base = (process.argv[2] || 'http://127.0.0.1:4180').replace(/\/$/, '')

let checks = 0
const failures = []

function ok(condition, label) {
  checks++
  if (!condition) failures.push(label)
}

function has(html, pattern, label) {
  ok(typeof pattern === 'string' ? html.includes(pattern) : pattern.test(html), label)
}

async function get(path) {
  const res = await fetch(`${base}${path}`)
  return { status: res.status, html: await res.text() }
}

/* ------------------------------------------------------------------ home -- */

const home = await get('/')
ok(home.status === 200, `GET / is 200 (got ${home.status})`)
has(home.html, 'CooldownLol.gg', 'home shows the brand')
has(home.html, /href="\/Ashe"/, 'home links to /Ashe')
has(home.html, /href="\/Yasuo"/, 'home links to /Yasuo')
has(home.html, 'Search a champion', 'home has a search field')
const championLinks = new Set([...home.html.matchAll(/href="\/([A-Za-z0-9_'.\-]+)"/g)].map((m) => m[1]))
ok(championLinks.size > 100, `home lists the whole roster (found ${championLinks.size} links)`)

/* ----------------------------------------------------------------- ashe -- */

const ashe = await get('/Ashe')
ok(ashe.status === 200, `GET /Ashe is 200 (got ${ashe.status})`)
has(ashe.html, '<title>Ashe', 'Ashe page title')
has(ashe.html, 'The Frost Archer', 'Ashe epithet is shown')

// The five abilities, in the order the champion page presents them.
for (const name of ['Frost Shot', "Ranger's Focus", 'Volley', 'Hawkshot', 'Enchanted Crystal Arrow']) {
  has(ashe.html, name, `Ashe page shows ${name}`)
}

// Requested headline numbers, taken from the wiki.
has(ashe.html, /<span class="rank-val[^"]*"[^>]*>18<\/span>/, 'Volley cooldown rank 1 = 18')
has(ashe.html, /<span class="rank-val[^"]*"[^>]*>14\.5<\/span>/, 'Volley cooldown rank 2 = 14.5')
has(ashe.html, /<span class="rank-val[^"]*"[^>]*>7\.5<\/span>/, 'Volley cooldown rank 4 = 7.5')
has(ashe.html, '1,200', 'Volley effect radius 1,200 (grouped)')
has(ashe.html, 'Global', 'Hawkshot target range reads Global')
has(ashe.html, '1,000', 'Hawkshot effect radius 1,000 (grouped)')
has(ashe.html, /<span class="rank-val[^"]*"[^>]*>100<\/span>/, 'Enchanted Crystal Arrow cooldown rank 1 = 100')
has(ashe.html, /<span class="rank-val[^"]*"[^>]*>80<\/span>/, 'Enchanted Crystal Arrow cooldown rank 2 = 80')
has(ashe.html, /<span class="rank-val[^"]*"[^>]*>60<\/span>/, 'Enchanted Crystal Arrow cooldown rank 3 = 60')
// `400 • 350` is rendered as a span, not as a rank progression.
has(ashe.html, /400<\/span>\s*<span class="span-dash/, 'Enchanted Crystal Arrow radius renders as 400–350 span')

// Per-level scaling rows.
has(ashe.html, 'Arrows', 'Volley leveling row: Arrows')
has(ashe.html, 'Physical Damage', 'Volley leveling row: Physical Damage')
has(ashe.html, 'Bonus Attack Speed', "Ranger's Focus leveling row: Bonus Attack Speed")
has(ashe.html, 'Magic Damage', 'Enchanted Crystal Arrow leveling row: Magic Damage')

// Descriptions must be in the served HTML (hidden, not absent).
has(ashe.html, 'Show description', 'description toggles are present')
has(ashe.html, /class="disclosure-body[^"]*"[^>]*hidden/, 'description bodies are collapsed with hidden')
ok(
  (ashe.html.match(/disclosure-body/g) || []).length === 5,
  `all five abilities have a description body (found ${(ashe.html.match(/disclosure-body/g) || []).length})`,
)

// Wiki styling tokens.
has(ashe.html, /class="hl hl--physical"/, 'physical damage highlight token')
has(ashe.html, /class="hl hl--ad-ratio"/, 'AD ratio highlight token')
has(ashe.html, /class="kw kw--glossary"/, 'keyword badge for glossary terms')
has(ashe.html, /class="sbc"/, 'bold ability lead-in (Active:/Passive:) marker')
has(ashe.html, 'shoots a volley of arrows', 'Volley description text is in the HTML')
has(ashe.html, 'sends a hawk spirit', 'Hawkshot description text is in the HTML')

// Icons are local.
has(ashe.html, /src="\/icons\/abilities\//, 'ability icons served locally')
has(ashe.html, /src="\/icons\/champions\//, 'champion portrait served locally')
ok(!/src="https?:\/\/wiki\.leagueoflegends\.com\/en-us\/images/.test(ashe.html), 'no hotlinked wiki images')

/**
 * Asset URLs must be root-relative.
 *
 * Champion pages are flat files served at `/Ashe` (no trailing slash), so a
 * relative `./_app/...` would resolve to `/Ashe/_app/...` and 404 — the page
 * would render with no CSS and no JavaScript. This is easy to regress by
 * changing `kit.paths.relative`, so it is asserted against a real HTTP fetch.
 */
const assetRefs = [...ashe.html.matchAll(/(?:href|src)="([^"]*\.(?:css|js))"/g)].map((m) => m[1])
ok(assetRefs.length > 0, 'champion page references CSS/JS assets')
ok(
  assetRefs.every((ref) => ref.startsWith('/')),
  `every asset URL is root-relative (offending: ${assetRefs.filter((r) => !r.startsWith('/')).slice(0, 3).join(', ')})`,
)

// Every referenced stylesheet and module must actually be served.
for (const ref of [...new Set(assetRefs)].slice(0, 8)) {
  const res = await fetch(`${base}${ref}`)
  ok(res.status === 200, `asset ${ref} is served (got ${res.status})`)
  const type = res.headers.get('content-type') || ''
  if (ref.endsWith('.css')) {
    ok(type.includes('css'), `asset ${ref} is served as CSS (got ${type})`)
  } else {
    ok(type.includes('javascript'), `asset ${ref} is served as JavaScript (got ${type})`)
  }
}

// Rank pills in description text.
has(ashe.html, /class="rank-seq is-multi"/, 'rank progressions are marked up as pills')

/* --------------------------------------------------------------- sharing -- */

// A static host serves one file per casing, so a mis-cased link lands on the
// 404 fallback. That fallback is the application shell (the error page is
// rendered by the client), so what can be verified here is the shell plus the
// noscript content injected by tools/postbuild.mjs.
const lower = await get('/ashe')
ok(lower.status === 404, `mis-cased /ashe is a 404 from a static host (got ${lower.status})`)
has(lower.html, 'cooldownlol:noscript', '404 fallback carries the noscript block')
has(lower.html, 'Page not found', '404 fallback explains the problem without JavaScript')
has(lower.html, 'href="/Ashe"', '404 fallback links to the canonical /Ashe')
has(lower.html, 'href="/Yasuo"', '404 fallback links to every champion')

// Multi-word champions.
const mf = await get('/Miss_Fortune')
ok(mf.status === 200, `GET /Miss_Fortune resolves (got ${mf.status})`)
has(mf.html, 'Miss Fortune', 'Miss Fortune page renders')

/* ------------------------------------------------------------ 404 handling -- */

const missing = await get('/NotARealChampion')
ok(missing.status === 404, `unknown champion is a 404 (got ${missing.status})`)
has(missing.html, 'cooldownlol:noscript', 'unknown champion gets the useful fallback, not a blank page')
ok(missing.html.length > 5000, '404 fallback is not an empty shell')

/* ------------------------------------------------------------- a second one -- */

const yasuo = await get('/Yasuo')
ok(yasuo.status === 200, 'GET /Yasuo is 200')
has(yasuo.html, 'Steel Tempest', 'Yasuo abilities render')
// Yasuo's Q cooldown is attack-speed scaled, not a rank list: it must survive verbatim.
has(yasuo.html, /4\s*[–-]\s*1\.33/, "Yasuo Q keeps its verbatim '4 – 1.33' cooldown")

/* ------------------------------------------------------------------ done -- */

console.log(`\n${checks} render checks run against ${base}`)
if (failures.length) {
  console.error(`\nFAILED — ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('All render checks passed.')
