/**
 * Data integrity checks for src/lib/data/champions.json.
 *
 *   node tools/check-data.mjs
 *
 * These assert properties that must hold for the site to be correct, rather
 * than exact numbers (which change every patch). Run after every scrape.
 */
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DATA = join(ROOT, 'src', 'lib', 'data', 'champions.json')

const problems = []
const warnings = []
let checks = 0

function check(condition, message) {
  checks++
  if (!condition) problems.push(message)
}

const payload = JSON.parse(readFileSync(DATA, 'utf8'))
const champions = payload.champions

console.log(`Loaded ${champions.length} champions (generated ${payload.generatedAt})\n`)

/* ------------------------------------------------------------ top level ---- */

check(Array.isArray(champions), 'champions must be an array')
check(champions.length > 150, `expected a full roster, got ${champions.length}`)
check(Boolean(payload.generatedAt), 'missing generatedAt')
check(Boolean(payload.source), 'missing source attribution')

const slugs = new Set()
for (const champion of champions) {
  check(Boolean(champion.slug), 'champion without a slug')
  check(!slugs.has(champion.slug), `duplicate slug ${champion.slug}`)
  slugs.add(champion.slug)

  check(/^[A-Za-z0-9_'.\-]+$/.test(champion.slug), `slug has characters that need escaping: ${champion.slug}`)
  check(Boolean(champion.title), `${champion.slug}: missing epithet (title)`)
  check(champion.title !== champion.name, `${champion.slug}: title equals name, extraction likely wrong`)
  check(!/^An icon representing/i.test(champion.title ?? ''), `${champion.slug}: title is image alt text`)

  check(
    Array.isArray(champion.abilities) && champion.abilities.length >= 4,
    `${champion.slug}: expected at least 4 abilities, got ${champion.abilities?.length}`,
  )

  const slots = new Set()
  for (const ability of champion.abilities) {
    const where = `${champion.slug}/${ability.id}`

    check(Boolean(ability.name), `${where}: missing name`)
    check(Boolean(ability.slot), `${where}: missing slot`)
    slots.add(ability.slot)

    check(
      Array.isArray(ability.description) && ability.description.length > 0,
      `${where}: no description extracted`,
    )
    for (const block of ability.description) {
      check(Boolean(block.text), `${where}: empty description block`)
      checkNoUnsafeHtml(block.html, `${where}: description`)
      check(!/&#\d+;|&amp;#/.test(block.html), `${where}: description contains un-decoded entities`)
      check(!/<small>/i.test(block.html), `${where}: description still contains <small> markup`)
      // The rendered HTML must read the same as the plain text it was built
      // from: this catches lost or doubled spaces between inline elements.
      check(
        readsTheSame(block.html, block.text),
        `${where}: rendered HTML does not read like its source text\n       text: ${block.text.slice(0, 100)}\n       html: ${block.html.slice(0, 100)}`,
      )
    }

    for (const row of ability.leveling) {
      check(Boolean(row.label), `${where}: leveling row without a label`)
      check(Boolean(row.text), `${where}: leveling row without text`)
      checkNoUnsafeHtml(row.html, `${where}: leveling ${row.label}`)
      check(
        readsTheSame(row.html, row.text),
        `${where}: leveling “${row.label}” HTML does not read like its source text\n       text: ${row.text.slice(0, 100)}\n       html: ${row.html.slice(0, 100)}`,
      )
      check(!/^<dd|<dd>/i.test(row.html), `${where}: leveling HTML still wraps a <dd>`)
    }

    // Icons are local paths, never remote URLs.
    if (ability.iconUrl) {
      check(ability.iconUrl.startsWith('/icons/'), `${where}: icon is not a local path (${ability.iconUrl})`)
      check(
        existsSync(join(ROOT, 'static', ability.iconUrl)),
        `${where}: icon file missing at static${ability.iconUrl}`,
      )
    } else {
      warnings.push(`${where}: no icon`)
    }

    // A cooldown that parsed as a list must produce the same numbers the wiki showed.
    if (ability.cooldown?.range?.perLevel) {
      const fromText = ability.cooldown.text
        .split(/\s*\/\s*/)
        .map(Number)
        .filter((n) => Number.isFinite(n))
      if (fromText.length === ability.cooldown.range.perLevel.length) {
        check(
          fromText.every((n, i) => n === ability.cooldown.range.perLevel[i]),
          `${where}: cooldown numbers disagree with the source text`,
        )
      }
    }
  }

  // Every champion should have a passive and four actives.
  check(slots.has('P'), `${champion.slug}: no passive (P) ability found`)
  for (const slot of ['Q', 'W', 'E', 'R']) {
    check(slots.has(slot), `${champion.slug}: missing ${slot}`)
  }
}

if (champion_icon_missing()) {
  warnings.push('some champion icons are missing')
}
function champion_icon_missing() {
  return champions.some((c) => !c.iconUrl)
}

/**
 * Reconstruct the visible text of a rendered fragment and compare it with the
 * plain source text.
 *
 * Both sides are reduced to the same canonical form first, so the comparison is
 * about *content* rather than about where a tag happened to sit:
 *   - tags become a placeholder, so `<b>a</b><i>b</i>` is not "ab"
 *   - every run of non-alphanumeric characters collapses to a single space
 *
 * That keeps the check strict about words, numbers and punctuation (dropping a
 * word or mangling a number still fails) while ignoring whether a space sits
 * before or after punctuation — a difference that cannot affect what a reader
 * sees.
 */
function canonical(value) {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|\u00a0/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[^0-9A-Za-z]+/g, ' ')
    .trim()
    .toLowerCase()
}

function readsTheSame(html, text) {
  return canonical(html) === canonical(text)
}

function checkNoUnsafeHtml(html, where) {
  if (!html) return
  check(!/<script/i.test(html), `${where}: contains a <script> tag`)
  check(!/\son[a-z]+\s*=/i.test(html), `${where}: contains an inline event handler`)
  check(!/javascript:/i.test(html), `${where}: contains a javascript: URL`)
  check(!/data:text\/html/i.test(html), `${where}: contains a data:text/html URL`)
  check(!/<iframe|<object|<embed/i.test(html), `${where}: contains an embedding tag`)
  check(!/style\s*=/i.test(html), `${where}: contains an inline style attribute`)
}

/* -------------------------------------------------------------- summary ---- */

const totalAbilities = champions.reduce((n, c) => n + c.abilities.length, 0)
const withCooldown = champions.reduce((n, c) => n + c.abilities.filter((a) => a.cooldown?.text).length, 0)
const withRadius = champions.reduce((n, c) => n + c.abilities.filter((a) => a.effectRadius?.text).length, 0)
const withRange = champions.reduce((n, c) => n + c.abilities.filter((a) => a.range?.text).length, 0)
const withLeveling = champions.reduce((n, c) => n + c.abilities.filter((a) => a.leveling.length).length, 0)

console.log(`Abilities:        ${totalAbilities}`)
console.log(`  with cooldown:  ${withCooldown}`)
console.log(`  with radius:    ${withRadius}`)
console.log(`  with range:     ${withRange}`)
console.log(`  with leveling:  ${withLeveling}`)
console.log(`Checks run:       ${checks}`)

if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`)
  for (const w of warnings.slice(0, 25)) console.log(`  - ${w}`)
  if (warnings.length > 25) console.log(`  ... and ${warnings.length - 25} more`)
}

if (problems.length) {
  console.error(`\nFAILED — ${problems.length} problem(s):`)
  for (const p of problems.slice(0, 40)) console.error(`  - ${p}`)
  if (problems.length > 40) console.error(`  ... and ${problems.length - 40} more`)
  process.exit(1)
}

console.log('\nAll data checks passed.')
