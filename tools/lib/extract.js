/**
 * Extract structured champion ability data from a rendered wiki.leagueoflegends.com
 * champion page.
 *
 * Everything here reads the *rendered* page (class-tagged, server-side HTML).
 * That is deliberate: the raw wikitext behind each ability uses templates such as
 * `{{ap|18 to 4}}` that need the wiki's own Lua modules to expand, whereas the
 * rendered page already contains the expanded numbers the reader sees.
 *
 * Discovery of stat labels is data-driven (whatever `ability-info-stats__stat`
 * rows the page contains are kept, keyed by their normalised label), so
 * champion-specific fields like "TARGET RANGE" or "RECHARGE" need no special casing.
 */
import { parseHtml, findAll, find, hasClass, textOf, isElement } from './html.js'

const WIKI = 'https://wiki.leagueoflegends.com'
const PREFIX = '/en-us/'

/** Inline hex colors used by the wiki to mean "this is a game term of type X". */
const TOKEN_BY_COLOR = {
  '#ff8c34': 'physical',
  '#f5ee99': 'attack-speed',
  '#7a6dff': 'magic',
  '#b4814c': 'ad-ratio',
  '#00b0f4': 'mana',
  'orange': 'ad-ratio',
  'orangered': 'crit',
  'red': 'health',
  'lime': 'heal',
  'yellow': 'gold',
}

function normalizeWhitespace(value) {
  return String(value).replace(/\s+/g, ' ').trim()
}

function labelKey(label) {
  return normalizeWhitespace(label).replace(/:$/, '').toLowerCase()
}

/** `18 / 14.5 / 11` or `400 • 350` -> numbers; `Global` / `1 Charge` -> null. */
function parseSequence(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/%$/, '')
    .replace(/\s*[•·]\s*/g, ' / ')
    .replace(/\s+to\s+/gi, ' / ')
  if (!/^[-\d.\s/]+$/.test(cleaned)) return null
  const parts = cleaned.split('/').map((p) => p.trim()).filter((p) => p !== '')
  if (parts.length < 1) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isFinite(n))) return null
  return nums
}

/**
 * Summarise a numeric list. `min`/`max` are absolute bounds (so
 * `0 - 350 • 450` becomes 0..450), while `first`/`last` keep the wiki's own
 * ordering (so a cooldown of `4 – 1.33` reads 4 down to 1.33).
 */
function parseRange(value) {
  const nums = parseSequence(value)
  if (!nums || nums.length < 2) return null
  return {
    min: Math.min(...nums),
    max: Math.max(...nums),
    first: nums[0],
    last: nums[nums.length - 1],
    perLevel: nums,
    count: nums.length,
  }
}

function absoluteUrl(href) {
  if (!href) return null
  if (href.startsWith('http')) return href
  if (href.startsWith('//')) return `https:${href}`
  if (href.startsWith('/')) return `${WIKI}${href}`
  return null
}

/* ---------------------------------------------------------------- icons ---- */

const RARITY_ICONS = new Set([
  'Ashe_OriginalSquare.png',
])

/**
 * Ability icons sit either lazily (`data-src`) or eagerly (`src`) depending on
 * whether the tab is the visible one, so both are checked.
 */
function pickIconUrl(node, { minWidth = 0, excludePrefixes = [] } = {}) {
  for (const img of findAll(node, (n) => n.tag === 'img')) {
    const width = Number(img.attrs.width || 0)
    if (width && width < minWidth) continue
    const raw = img.attrs.src || img.attrs['data-src'] || ''
    if (!raw) continue
    if (excludePrefixes.some((p) => raw.includes(p))) continue
    return absoluteUrl(raw)
  }
  return null
}

/* ---------------------------------------------------- description render ---- */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Turn one wiki keyword wrapper into a compact text token.
 *
 * The wiki renders every keyword as an inline icon image followed by a link.
 * Images would mean hotlinking hundreds of assets, so keywords become a small
 * text badge: `<span class="kw kw--champion">champions</span>`. The tooltip
 * (`data-tip`) is preserved as a `title` so hover text survives.
 */
function renderKeyword(node) {
  const tip = node.attrs['data-tip'] || node.attrs.title || ''
  const link = findAll(node, (n) => n.tag === 'a').find((a) => normalizeWhitespace(textOf(a)) !== '')
  let label = normalizeWhitespace(textOf(node))
  if (!label) {
    // Icon-only glossary terms carry their meaning in the tooltip.
    label = normalizeWhitespace(tip)
  }
  if (!label) return ''
  // `「 repeatedly for ... 」` style alternate phrasings: keep the first variant.
  label = label.replace(/^[「\s]+|[」\s]+$/g, '')
  const cls = (node.attrs.class || '').split(/\s+/)
  const kind = cls.includes('champion-icon')
    ? 'champion'
    : cls.includes('ability-icon') || cls.includes('item-icon')
      ? 'ability'
      : cls.includes('glossary')
        ? 'glossary'
        : 'term'
  const href = absoluteUrl(link?.attrs.href)
  const title = tip ? ` title="${escapeHtml(tip)}"` : ''
  const inner = href
    ? `<a class="kw kw--${kind}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer"${title}>${escapeHtml(label)}</a>`
    : `<span class="kw kw--${kind}"${title}>${escapeHtml(label)}</span>`
  return inner
}

function renderNode(node, ctx) {
  if (!isElement(node)) {
    // Text arrives already entity-decoded from the parser, so it must be
    // re-escaped exactly once here. Escaping anywhere else double-encodes it.
    //
    // Whitespace is collapsed to a single space but NOT trimmed: the runs that
    // sit between inline elements are the only thing separating words such as
    // "dealing <physical damage> to", so trimming here loses real spaces.
    return escapeHtml(node.text || '').replace(/\s+/g, ' ')
  }

  const attrs = node.attrs || {}
  const cls = (attrs.class || '').split(/\s+/).filter(Boolean)
  const tag = node.tag

  // Never surface wiki chrome.
  if (tag === 'script' || tag === 'style' || cls.includes('plainlinks') || cls.includes('mw-empty-elt')) {
    return ''
  }

  // Keyword wrappers (icons + glossary + item/ability icons).
  if (cls.includes('glossary') || cls.includes('inline-image')) {
    const rendered = renderKeyword(node)
    if (rendered) return rendered
  }

  const children = () => (node.children || []).map((c) => renderNode(c, ctx)).join('')

  // Collapsible alternate phrasings: keep the first, drop the hidden duplicate.
  if (cls.includes('flipText2')) return ''
  if (cls.includes('flipText1')) return children()

  // `{{sbc|Active:}}` style bold lead-ins.
  if (cls.includes('template_sbc')) {
    return `<span class="sbc">${children()}</span>`
  }

  const allowed = new Set(['b', 'strong', 'i', 'em', 'u', 'small', 'sub', 'sup', 'br', 'span', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'p'])
  if (!allowed.has(tag)) {
    // Unknown wrappers (div, table, ...) contribute only their text content.
    return children()
  }

  // Semantic highlight tokens from inline color styles.
  const style = attrs.style || ''
  const colorMatch = /color\s*:\s*([^;"]+)/i.exec(style)
  let out = children()
  if (colorMatch) {
    const color = colorMatch[1].trim().toLowerCase()
    const token = TOKEN_BY_COLOR[color]
    if (token) out = `<span class="hl hl--${token}">${out}</span>`
  }

  if (tag === 'a') {
    const href = absoluteUrl(attrs.href)
    if (href) {
      return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${out}</a>`
    }
    return out
  }
  if (tag === 'b' || tag === 'strong') return `<strong>${out}</strong>`
  if (tag === 'i' || tag === 'em') return `<em>${out}</em>`
  if (tag === 'br') return '<br>'
  if (tag === 'li') return `<li>${out}</li>`
  if (tag === 'ul' || tag === 'ol' || tag === 'dl' || tag === 'dt' || tag === 'dd' || tag === 'p') {
    return `<${tag}>${out}</${tag}>`
  }
  return out
}

/**
 * Plain text of a rendered fragment, derived FROM that fragment.
 *
 * Deriving it this way (rather than reading the source node again) is what keeps
 * `text` and `html` in agreement: any transformation the renderer applies — for
 * instance dropping the wiki's hidden alternate phrasings — is reflected in both.
 */
function renderedText(html) {
  return normalizeWhitespace(String(html).replace(/<[^>]*>/g, ' '))
}

/**
 * Tidy a rendered fragment without changing its meaning.
 *
 * Critically this never removes interior whitespace: the space between a text
 * run and an inline element is what separates two words, so only edges of
 * block-level elements and the very start/end of the fragment are trimmed.
 */
function finalizeHtml(html) {
  let out = html
  out = out.replace(/<span class="kw kw--[a-z]+"><\/span>/g, '')
  out = out.replace(/<a[^>]*>\s*<\/a>/g, '')
  out = out.replace(/(<br\s*\/?>\s*){3,}/g, '<br><br>')
  // No whitespace before punctuation.
  out = out.replace(/\s+([,.;:!?])/g, '$1')
  // Trim only around block boundaries, where leading/trailing space is invisible.
  out = out.replace(/(<\/(?:li|ul|ol|dl|dt|dd|p|div)>)\s+/g, '$1')
  // The source contains doubly-encoded entities (`&amp;#160;`); the parser
  // decodes one level, so a literal `&#160;` remains and is decoded here.
  out = out.replace(/&#(\d+);/g, (_, d) => {
    const code = Number(d)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : _
  })
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
  out = out.replace(/\u00a0/g, ' ')
  out = out.replace(/\s+/g, ' ')
  return out.trim()
}

/* ------------------------------------------------------------- abilities ---- */

function extractStatRows(card) {
  const stats = {}
  for (const stat of findAll(card, (n) => hasClass(n, 'ability-info-stats__stat'))) {
    const label = find(stat, (n) => hasClass(n, 'ability-info-stats__stat-label'))
    const value = find(stat, (n) => hasClass(n, 'ability-info-stats__stat-value'))
    if (!label || !value) continue
    const key = labelKey(textOf(label))
    if (!key) continue
    stats[key] = normalizeWhitespace(textOf(value))
  }
  return stats
}

/**
 * Render only the children of a node, dropping the wrapper element itself.
 * Used for `dd`/`dt` so the generated HTML does not contain a nested `<dd>`
 * that the page then renders inside its own definition list.
 */
function renderChildren(element) {
  return (element.children || []).map((child) => renderNode(child, {})).join('')
}

/**
 * Per-rank scaling rows live in `dl.skill-tabs`, as a repeating
 * `dt` (label) / `dd` (value) sequence. Some rows hold several labelled values
 * in one `dl`, so pairing walks the children in document order.
 */
function extractLeveling(card) {
  const rows = []
  for (const dl of findAll(card, (n) => n.tag === 'dl')) {
    let pending = null
    for (const child of dl.children || []) {
      if (!isElement(child)) continue
      if (child.tag === 'dt') {
        pending = normalizeWhitespace(textOf(child)).replace(/:$/, '')
      } else if (child.tag === 'dd' && pending) {
        const html = finalizeHtml(renderChildren(child))
        const text = renderedText(html)
        if (text) {
          rows.push({ label: pending, text, values: parseSequence(text), range: parseRange(text), html })
        }
        pending = null
      }
    }
  }
  return rows
}

function extractDescription(card) {
  const content = find(card, (n) => hasClass(n, 'ability-info-content'))
  const scope = content || card
  const blocks = []
  const rows = findAll(scope, (n) => hasClass(n, 'ability-info-row'))
  for (const row of rows) {
    for (const desc of findAll(row, (n) => hasClass(n, 'ability-info-description'))) {
      const html = finalizeHtml(renderNode(desc, {}))
      const text = renderedText(html)
      if (text) blocks.push({ text, html })
    }
  }
  if (!blocks.length) {
    // Fall back to the compact JSON blob the wiki also emits.
    const json = find(card, (n) => hasClass(n, 'ability-json'))
    if (json) {
      const html = finalizeHtml(renderNode(json, {}))
      const text = renderedText(html)
      if (text) blocks.push({ text, html })
    }
  }
  return blocks
}

/**
 * The slot key (`Q`/`W`/`E`/`R`, or `P` for an innate) is on the *outer*
 * `div.skill.skill_q` wrapper, not on any inner card.
 *
 * Two wrinkles exist in the wild and both are handled here:
 *   - the innate is `skill_innate`, not `skill_p`;
 *   - grouped sub-abilities pack several letters into the class (`skill_qqwe`
 *     for Hwei's Q spellbook), in which case the first letter is the slot.
 * `skill_header` never matches, so cards are not mistaken for wrappers.
 */
function slotFromClasses(node) {
  const tokens = (node.attrs.class || '').split(/\s+/)
  if (tokens.includes('skill_innate') || tokens.includes('skill_p')) return 'P'
  const suffixed = tokens.filter((c) => /^skill_[a-z]/i.test(c) && c !== 'skill_header')
  if (!suffixed.length) return null
  return suffixed[suffixed.length - 1].slice(6, 7).toUpperCase()
}

/** Find the first stat whose normalised label matches one of these names. */
function pickStat(stats, ...names) {
  for (const name of names) {
    if (stats[name] !== undefined) return stats[name]
  }
  return null
}

function describeStat(value) {
  if (!value) return null
  const text = normalizeWhitespace(value)
  if (!text) return null
  return { text, range: parseRange(text), values: parseSequence(text) }
}

/** Slugs must be unique per champion and safe inside an `id=` attribute. */
function slugifyName(name) {
  return name
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

/**
 * Extract the abilities of one champion.
 *
 * Work is driven by the `div.skill` wrappers, because they are the only element
 * that reliably identifies a slot. Within a wrapper, the document order of
 * `ability-info-stats` containers, descriptions and leveling lists is used to
 * associate each group:
 *
 *   [stats][description rows...][stats][description rows...] ...
 *
 * That shape covers a plain ability (one group) and a grouped one such as
 * Hwei's `Subject: Disaster` (a parent group followed by one group per
 * sub-ability), without needing champion-specific rules.
 */
/**
 * Select the ability scopes: `div.skill.skill_<x>` containers only.
 *
 * The inner card is `div.skill_header.skill_wrapper`, which also begins with
 * "skill_" — matching it as a wrapper would extract every ability several times
 * under mangled names, so wrapping classes are excluded explicitly.
 */
function abilityWrappers(root) {
  return findAll(root, (n) => {
    if (n.tag !== 'div') return false
    const tokens = (n.attrs.class || '').split(/\s+/).filter(Boolean)
    if (!tokens.includes('skill')) return false
    if (tokens.includes('skill_header') || tokens.includes('skill_wrapper')) return false
    // Hidden tooltip copies of abilities (referenced by other champions' pages).
    if (tokens.includes('abilitytooltip') || tokens.includes('blurb')) return false
    return tokens.some((t) => /^skill_[a-z]/i.test(t))
  })
}

function extractAbilities(root) {
  const wrappers = abilityWrappers(root)

  const abilities = []
  const usedIds = new Set()

  for (const wrapper of wrappers) {
    const slot = slotFromClasses(wrapper)
    const groups = groupAbilityContent(wrapper)
    if (!groups.length) continue

    groups.forEach((group, index) => {
      // Prefer the card's own id (a stable fragment on the wiki page), then the
      // ability name. Some cards carry no id at all, so a name-derived slug is
      // the fallback, and a positional id the last resort.
      const name = group.name || 'Ability'
      let id = group.cardId || slugifyName(name)
      if (!id) id = `${slot ?? 'X'}_${index + 1}`
      if (usedIds.has(id)) id = `${id}_${index + 1}`
      usedIds.add(id)

      const statsScope = group.statsNode || wrapper
      const stats = extractStatRows(statsScope)
      // Per-level rows live in `.ability-info-content`, a sibling of the stats
      // anchor; fall back to the anchor when there is no content block.
      const levelingScope = group.contentNode || statsScope
      const leveling = extractLeveling(levelingScope)
      const iconUrl =
        pickIconUrl(group.contentNode || statsScope, { minWidth: 40 }) || null

      abilities.push({
        id,
        name,
        slot,
        iconUrl,
        cooldown: describeStat(pickStat(stats, 'cooldown', 'static cooldown', 'recharge', 'ammo recharge')),
        range: describeStat(pickStat(stats, 'target range', 'range')),
        effectRadius: describeStat(pickStat(stats, 'effect radius')),
        stats,
        leveling,
        description: group.descriptions,
        flavor: group.flavor,
        /** `group` on the parent of a grouped ability (Hwei's spellbooks), `sub` on its parts. */
        kind: group.isParent ? 'group' : group.isChild ? 'sub' : 'ability',
      })
    })
  }

  return abilities
}

/**
 * The stats container that anchors a group is
 * `div.ability-info-stats__wrapper`, which holds the name element
 * (`...__ability`) and the stat rows (`...__list`). The bare
 * `ability-info-stats` divs inside the description rows are empty spacers.
 */
const STATS_ANCHOR = 'ability-info-stats__wrapper'

/**
 * Split a wrapper into ability groups.
 *
 * Each `ability-info-stats__wrapper` starts a group; the descriptions and flavor
 * text that follow it (up to the next anchor) belong to it. A plain ability
 * yields one group, a grouped ability such as Hwei's `Subject: Disaster` yields a
 * parent group followed by one per sub-ability.
 */
function groupAbilityContent(wrapper) {
  const nodes = findAll(wrapper, () => true)

  const anchors = [] // { index, node, name, content }
  const descriptions = [] // { index, node }
  const flavors = [] // { index, node }

  nodes.forEach((node, index) => {
    if (isInsideJsonBlob(node)) return
    if (hasClass(node, STATS_ANCHOR)) {
      const nameNode = find(node, (n) => hasClass(n, 'ability-info-stats__ability'))
      anchors.push({
        index,
        node,
        name: nameNode ? normalizeWhitespace(textOf(nameNode)) : '',
        content: null,
      })
    } else if (hasClass(node, 'ability-info-description')) {
      descriptions.push({ index, node })
    } else if (hasClass(node, 'ability-info-flavor')) {
      flavors.push({ index, node })
    }
  })

  if (!anchors.length) return []

  // The per-level `dl` rows and the icons live in an `.ability-info-content`
  // sibling of the stats anchor, so record the first one that follows each anchor
  // and precedes the next.
  const contents = nodes
    .map((node, index) => ({ node, index }))
    .filter((entry) => hasClass(entry.node, 'ability-info-content'))

  const groups = anchors.map((anchor, i) => {
    const next = anchors[i + 1]?.index ?? Number.POSITIVE_INFINITY
    const content = contents.find((c) => c.index > anchor.index && c.index < next)
    const group = {
      statsNode: anchor.node,
      contentNode: content ? content.node : null,
      name: anchor.name,
      cardId: null,
      descriptions: [],
      flavor: '',
    }
    for (const d of descriptions) {
      if (d.index > anchor.index && d.index < next) {
        const html = finalizeHtml(renderNode(d.node, {}))
        const text = renderedText(html)
        if (text) group.descriptions.push({ text, html })
      }
    }
    for (const f of flavors) {
      if (f.index > anchor.index && f.index < next && !group.flavor) {
        group.flavor = normalizeWhitespace(textOf(f.node))
      }
    }
    return group
  })

  // Card ids live on the inner card; match each group's anchor to its card.
  const cards = findAll(wrapper, (n) => n.tag === 'div' && (n.attrs.class || '').includes('skill_header'))
  for (const card of cards) {
    if (!card.attrs.id) continue
    const owner = groups.find((g) => g.statsNode && isDescendant(card, g.statsNode))
    if (owner) owner.cardId = card.attrs.id
  }
  if (!groups.some((g) => g.cardId) && wrapper.attrs.id) {
    groups[0].cardId = wrapper.attrs.id
  }

  if (groups.length > 1) {
    groups.forEach((g, i) => {
      g.isParent = i === 0
      g.isChild = i > 0
    })
  }

  return groups.filter((g) => g.name)
}

/** The `ability-json` blob duplicates the content rows and is skipped. */
function isInsideJsonBlob(node) {
  let cur = node
  while (cur) {
    if (hasClass(cur, 'ability-json')) return true
    cur = cur.parent
  }
  return false
}

function isDescendant(ancestor, node) {
  let cur = node
  while (cur) {
    if (cur === ancestor) return true
    cur = cur.parent
  }
  return false
}

/* -------------------------------------------------------------- champion ---- */

function extractChampionMeta(root, slug) {
  const iconUrl =
    pickIconUrl(root, { minWidth: 100, excludePrefixes: ['_OriginalSquare'] }) ||
    pickIconUrl(root, { minWidth: 100 }) ||
    null

  const stats = {}
  for (const row of findAll(root, (n) => hasClass(n, 'infobox-data-row'))) {
    const label = find(row, (n) => hasClass(n, 'infobox-data-label'))
    const value = find(row, (n) => hasClass(n, 'infobox-data-value'))
    if (!label || !value) continue
    const key = labelKey(textOf(label))
    if (key && !(key in stats)) stats[key] = normalizeWhitespace(textOf(value))
  }

  // Provenance: the wiki states the patch a page was last changed in.
  const patch = (textOf(root).match(/\bV(\d{2}\.\d{1,2})\b/) || [])[1] || null

  return {
    name: slug.replace(/_/g, ' '),
    slug,
    iconUrl,
    pageUrl: `${WIKI}${PREFIX}${slug}`,
    patch: patch ? `V${patch}` : null,
    baseStats: stats,
  }
}

/** Extract one champion from already-fetched page HTML. */
export function extractChampionFromHtml(html, slug) {
  const root = parseHtml(html)
  const champion = extractChampionMeta(root, slug)
  const abilities = extractAbilities(root)
  return { ...champion, abilities }
}

/**
 * Parse the roster table on /en-us/List_of_champions.
 * The champion cell's first link is the champion page; its title attribute is
 * the champion's epithet.
 */
export function extractRoster(html) {
  const root = parseHtml(html)
  const table = findAll(root, (n) => n.tag === 'table' && (n.attrs.class || '').includes('article-table'))[0]
  if (!table) return []
  const out = []
  const seen = new Set()
  for (const tr of findAll(table, (n) => n.tag === 'tr')) {
    const cells = findAll(tr, (n) => n.tag === 'td')
    if (!cells.length) continue
    const first = cells[0]
    // Each champion cell holds an icon link (empty text) and a text link whose
    // content is the champion name followed by its epithet.
    const links = findAll(first, (n) => n.tag === 'a' && (n.attrs.href || '').startsWith(PREFIX))
    const link = links.find((a) => normalizeWhitespace(textOf(a)) !== '')
    if (!link) continue
    const slug = decodeURIComponent(link.attrs.href.slice(PREFIX.length))
    if (!/^[A-Za-z0-9_'.\-%]+$/.test(slug) || seen.has(slug)) continue
    seen.add(slug)
    const name = slug.replace(/_/g, ' ')
    const linkText = normalizeWhitespace(textOf(link))
    const epithet = linkText.startsWith(name) ? linkText.slice(name.length).trim() : ''
    out.push({
      slug,
      name,
      title: epithet || null,
      iconUrl: pickIconUrl(first, { minWidth: 20 }) || null,
    })
  }
  return out
}

export const WIKI_BASE = WIKI
export const WIKI_PREFIX = PREFIX
