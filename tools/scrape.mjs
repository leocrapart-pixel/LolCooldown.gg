/**
 * Build the champion dataset.
 *
 *   node tools/scrape.mjs              # all champions (cached, resumable)
 *   node tools/scrape.mjs Ashe Ahri    # only the named champions
 *   node tools/scrape.mjs --refresh    # ignore the HTML cache
 *
 * Politeness: robots.txt on the wiki disallows `api.php` and any `?action=`
 * query, so this fetches only canonical `/en-us/<Champion>` pages, slowly, with
 * a descriptive User-Agent and a large on-disk cache so re-runs cost nothing.
 *
 * Icons are downloaded too, because the wiki serves them from signed-ish
 * `/images/...?hash` URLs that are not reliable to hotlink long term. They are
 * re-encoded to stable local paths under `static/icons/`.
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractChampionFromHtml, extractRoster, WIKI_BASE, WIKI_PREFIX } from './lib/extract.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const CACHE = join(HERE, '.cache')
const HTML_CACHE = join(CACHE, 'html')
const ICON_CACHE = join(CACHE, 'icons')
const OUT_DATA = join(ROOT, 'src', 'lib', 'data', 'champions.json')
const OUT_ICONS = join(ROOT, 'static', 'icons')

const USER_AGENT =
  'CooldownLol.gg/1.0 (fan stats site; build-time extraction; contact: site owner)'
const DELAY_MS = 350
const CONCURRENCY = 3

const args = process.argv.slice(2)
const refresh = args.includes('--refresh')
const only = args.filter((a) => !a.startsWith('--'))

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let lastRequest = 0

async function politeFetch(url) {
  // Serialise request starts so the spacing is real even with concurrency.
  const now = Date.now()
  const wait = Math.max(0, lastRequest + DELAY_MS - now)
  lastRequest = now + wait
  if (wait) await sleep(wait)

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (res.status === 429 || res.status >= 500) {
      await sleep(1500 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
    return Buffer.from(await res.arrayBuffer())
  }
  throw new Error(`giving up on ${url}`)
}

function cacheName(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 16)
}

async function cachedFetchText(url) {
  await mkdir(HTML_CACHE, { recursive: true })
  const file = join(HTML_CACHE, `${cacheName(url)}.html`)
  if (!refresh && existsSync(file)) return readFile(file, 'utf8')
  const buf = await politeFetch(url)
  const text = buf.toString('utf8')
  await writeFile(file, text)
  return text
}

/** Download an icon and return the public path to serve it from. */
async function cacheIcon(url, kind, name) {
  await mkdir(ICON_CACHE, { recursive: true })
  const slug = name.replace(/[^A-Za-z0-9._-]+/g, '_')
  const key = createHash('sha1').update(url).digest('hex').slice(0, 8)
  const filename = `${slug}--${key}.png`
  const cached = join(ICON_CACHE, filename)
  const publicDir = join(OUT_ICONS, kind)
  const publicPath = join(publicDir, filename)
  const publicUrl = `/icons/${kind}/${filename}`

  if (!refresh && existsSync(cached)) {
    await mkdir(publicDir, { recursive: true })
    await writeFile(publicPath, await readFile(cached))
    return publicUrl
  }
  try {
    const buf = await politeFetch(url)
    await writeFile(cached, buf)
    await mkdir(publicDir, { recursive: true })
    await writeFile(publicPath, buf)
    return publicUrl
  } catch (error) {
    console.warn(`  ! icon failed ${url}: ${error.message}`)
    return null
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  console.log('Fetching champion roster...')
  const rosterHtml = await cachedFetchText(`${WIKI_BASE}${WIKI_PREFIX}List_of_champions`)
  let roster = extractRoster(rosterHtml)
  console.log(`Roster: ${roster.length} champions`)
  if (!roster.length) throw new Error('Roster extraction returned nothing — page markup changed?')

  if (only.length) {
    const wanted = new Set(only.map((n) => n.toLowerCase()))
    roster = roster.filter((r) => wanted.has(r.slug.toLowerCase()) || wanted.has(r.name.toLowerCase()))
    if (!roster.length) throw new Error(`None of ${only.join(', ')} found in roster`)
    console.log(`Restricted to ${roster.length}: ${roster.map((r) => r.slug).join(', ')}`)
  }

  const champions = []
  const failures = []
  let done = 0

  await mapLimit(roster, CONCURRENCY, async (entry) => {
    const url = `${WIKI_BASE}${WIKI_PREFIX}${entry.slug}`
    try {
      const html = await cachedFetchText(url)
      const champ = extractChampionFromHtml(html, entry.slug)

      // Titles come from the roster table; the champion page has no epithet.
      champ.title = entry.title || null
      if (entry.iconUrl) {
        champ.iconUrl = await cacheIcon(entry.iconUrl, 'champions', entry.slug)
      } else if (champ.iconUrl) {
        champ.iconUrl = await cacheIcon(champ.iconUrl, 'champions', entry.slug)
      } else {
        champ.iconUrl = null
      }

      for (const ability of champ.abilities) {
        ability.iconUrl = ability.iconUrl
          ? await cacheIcon(ability.iconUrl, 'abilities', `${entry.slug}-${ability.id}`)
          : null
      }

      if (!champ.abilities.length) {
        failures.push({ slug: entry.slug, reason: 'no abilities extracted' })
      }
      champions.push(champ)
    } catch (error) {
      failures.push({ slug: entry.slug, reason: error.message })
    }
    done++
    if (done % 20 === 0 || done === roster.length) console.log(`  ${done}/${roster.length}`)
  })

  champions.sort((a, b) => a.name.localeCompare(b.name))

  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'https://wiki.leagueoflegends.com/en-us/List_of_champions',
    license: 'League of Legends Wiki content is available under CC BY-SA 3.0 (see meta.weirdgloop.org/w/Meta:Copyrights).',
    champions,
  }
  await mkdir(dirname(OUT_DATA), { recursive: true })
  await writeFile(OUT_DATA, JSON.stringify(payload, null, 1))

  const abilityCount = champions.reduce((n, c) => n + c.abilities.length, 0)
  console.log(`\nWrote ${champions.length} champions / ${abilityCount} abilities -> ${OUT_DATA}`)
  if (failures.length) {
    console.log(`\n${failures.length} problem(s):`)
    for (const f of failures) console.log(`  - ${f.slug}: ${f.reason}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
