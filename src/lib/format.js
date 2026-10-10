/**
 * Presentation helpers. Pure functions only, so they can be unit-tested without
 * a DOM and reused by both the search list and the champion page.
 */

const RANK_LABELS = ['1', '2', '3', '4', '5']

/** Stat labels we can phrase better than the wiki's internal key. */
const LABEL_OVERRIDES = {
  hp: 'Health',
  mp: 'Mana',
  hp5: 'Health regen',
  mp5: 'Mana regen',
  ar: 'Armor',
  ad: 'Attack damage',
  mr: 'Magic resist',
  ms: 'Move speed',
  'crit. dmg': 'Crit damage',
  'attack range': 'Attack range',
  'base as': 'Base attack speed',
  'as ratio': 'Attack speed ratio',
  'bonus as': 'Bonus attack speed',
  'missile speed': 'Missile speed',
  'gameplay radius': 'Gameplay radius',
  'select. radius': 'Selection radius',
  'pathing radius': 'Pathing radius',
  'select. height': 'Selection height',
  'acq. radius': 'Acquisition radius',
  'damage dealt': 'Damage dealt',
  'damage received': 'Damage received',
  'release date': 'Release date',
  'last changed': 'Last changed',
  class: 'Class',
  'legacy class': 'Legacy class',
  resource: 'Resource',
  'range type': 'Range type',
  'adaptive type': 'Adaptive type',
  'targeting input': 'Targeting input',
  affects: 'Affects',
  type: 'Type',
  'sub-type(s)': 'Sub-type',
  'spell shield': 'Spell shield',
  parries: 'Parries',
  projectile: 'Projectile',
  cost: 'Cost',
  cooldown: 'Cooldown',
  'static cooldown': 'Cooldown',
  recharge: 'Recharge',
  'cast time': 'Cast time',
  range: 'Range',
  'target range': 'Target range',
  'effect radius': 'Effect radius',
  width: 'Width',
  angle: 'Angle',
  speed: 'Speed',
}

export function formatStatLabel(key) {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key]
  return key
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Present a stat value the way the wiki does: a list of numbers is split into
 * per-rank pills, anything else (`Global`, `0.25`, `1 Charge`) is shown as-is.
 *
 * @param {{ text: string, values?: number[] | null } | null} stat
 * @returns {{ parts: { text: string, isNumber: boolean, unit?: string }[] , multi: boolean }}
 */
export function statParts(stat) {
  if (!stat || !stat.text) return { parts: [], multi: false }
  const text = String(stat.text).trim()

  // Split `400 • 350` / `18 / 14.5 / 11` into ordered segments.
  const segments = text
    .split(/\s*\/\s*|\s*•\s*|\s*·\s*/)
    .map((s) => s.trim())
    .filter((s) => s !== '')

  const numeric = segments.length > 1 && segments.every((s) => /^-?\d+(\.\d+)?$/.test(s))
  if (!numeric) {
    return { parts: [{ text, isNumber: false }], multi: false }
  }
  return {
    parts: segments.map((s) => ({ text: s, isNumber: true })),
    multi: segments.length > 1,
  }
}

/** Does a stat read as a plain single value (no rank progression)? */
export function isSingleValue(stat) {
  return Boolean(stat && stat.text) && !stat.range
}

export function rankLabel(index) {
  return RANK_LABELS[index] ?? String(index + 1)
}

/**
 * Wrap rank progressions in the already-rendered (trusted, generated) ability
 * HTML with `.rank-seq` markup, so numbers stand out the way the wiki's own
 * leveling tables do.
 *
 * Only text nodes are touched: existing tags and their attributes are never
 * matched, so colours and keyword badges survive.
 */
export function markRankNumbers(html) {
  if (!html) return ''
  let out = ''
  let i = 0

  while (i < html.length) {
    const lt = html.indexOf('<', i)
    if (lt < 0) {
      out += wrapSequence(html.slice(i))
      break
    }
    out += wrapSequence(html.slice(i, lt))
    const gt = html.indexOf('>', lt)
    if (gt < 0) {
      out += html.slice(lt)
      break
    }
    out += html.slice(lt, gt + 1)
    i = gt + 1
  }
  return out
}

/**
 * Wrap a numeric sequence such as `60 / 95 / 130 / 165 / 200` in this text run.
 * A sequence needs at least two numeric parts separated by `/` to qualify, which
 * keeps ordinary prose slashes untouched.
 */
function wrapSequence(text) {
  const re = /(\d+(?:\.\d+)?)(\s*(?:\/|•|·)\s*(\d+(?:\.\d+)?))+/g
  return text.replace(re, (match) => {
    const numbers = match.split(/\s*(?:\/|•|·)\s*/)
    const pills = numbers
      .map((n) => `<span class="rank-val">${n}</span>`)
      .join('<span class="rank-sep">/</span>')
    return `<span class="rank-seq is-multi">${pills}</span>`
  })
}

/** `1200` -> `1,200`; leaves non-numeric text alone. */
export function formatNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('en-US') : String(value)
}

/** Abbreviate long patch/provenance strings for the footer. */
export function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/** Base stats worth putting in a compact panel, in display order. */
export const PANEL_STATS = [
  'hp',
  'mp',
  'ad',
  'ar',
  'mr',
  'ms',
  'attack range',
  'base as',
  'resource',
  'class',
]
