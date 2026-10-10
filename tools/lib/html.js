/**
 * A deliberately small HTML tree parser.
 *
 * Why not cheerio / jsdom / linkedom: the wiki HTML is well-formed
 * (MediaWiki output), we only need read access, and every dependency here
 * would be a large install for one throwaway build-time script. This is
 * ~80 lines, has no dependencies, and is enough for tag/attribute/class
 * lookups over the ability cards.
 */

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
  'meta', 'param', 'source', 'track', 'wbr',
])

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', deg: '\u00b0',
  times: '\u00d7', bull: '\u2022', minus: '\u2212', rsquo: '\u2019',
  lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d', middot: '\u00b7',
}

/**
 * Decode entities repeatedly until the value stops changing.
 *
 * MediaWiki output contains doubly-encoded entities where the meaning is
 * unambiguous (`&amp;#160;` means a no-break space, not the literal text
 * "&#160;"). Decoding to a fixed point at the source keeps every downstream
 * consumer from having to think about it.
 */
export function decodeEntities(value) {
  let out = String(value)
  for (let pass = 0; pass < 5; pass++) {
    const next = out.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, body) => {
      if (body[0] === '#') {
        const hex = body[1] === 'x' || body[1] === 'X'
        const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10)
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return whole
        try {
          return String.fromCodePoint(code)
        } catch {
          return whole
        }
      }
      const named = NAMED[body.toLowerCase()]
      return named === undefined ? whole : named
    })
    if (next === out) break
    out = next
  }
  return out
}

function parseAttrs(body, from) {
  const attrs = {}
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  re.lastIndex = from
  let m
  while ((m = re.exec(body))) {
    const value = m[2] ?? m[3] ?? m[4] ?? ''
    attrs[m[1].toLowerCase()] = decodeEntities(value)
  }
  return attrs
}

/** Parse an HTML string into a tree of `{ tag, attrs, children }` nodes (and `{ tag: '#text', text }`). */
export function parseHtml(src) {
  const root = { tag: '#root', attrs: {}, children: [] }
  const stack = [root]
  let i = 0

  while (i < src.length) {
    const lt = src.indexOf('<', i)
    if (lt < 0) break
    if (lt > i) stack[stack.length - 1].children.push({ tag: '#text', text: decodeEntities(src.slice(i, lt)) })

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt)
      i = end < 0 ? src.length : end + 3
      continue
    }
    if (src.startsWith('<!', lt) || src.startsWith('<?', lt)) {
      const end = src.indexOf('>', lt)
      i = end < 0 ? src.length : end + 1
      continue
    }

    const gt = src.indexOf('>', lt)
    if (gt < 0) break
    const raw = src.slice(lt + 1, gt)
    i = gt + 1

    if (raw[0] === '/') {
      // Close the nearest matching ancestor. Mismatched closes are ignored,
      // which is the forgiving behaviour we want for scraped markup.
      const name = raw.slice(1).trim().toLowerCase()
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === name) {
          stack.length = k
          break
        }
      }
      continue
    }

    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1) : raw
    const nameMatch = /^([a-zA-Z0-9:-]+)/.exec(body)
    if (!nameMatch) continue
    const tag = nameMatch[1].toLowerCase()
    const node = { tag, attrs: parseAttrs(body, nameMatch[0].length), children: [], parent: stack[stack.length - 1] }
    stack[stack.length - 1].children.push(node)
    if (!VOID.has(tag) && !selfClosing) stack.push(node)
  }

  return root
}

export function isElement(node) {
  return node && node.tag && node.tag !== '#text'
}

export function classes(node) {
  return isElement(node) ? (node.attrs.class || '').split(/\s+/).filter(Boolean) : []
}

export function hasClass(node, name) {
  return classes(node).includes(name)
}

/** Depth-first collection of every element matching `predicate`. */
export function findAll(root, predicate, out = []) {
  for (const child of root.children || []) {
    if (!isElement(child)) continue
    if (predicate(child)) out.push(child)
    findAll(child, predicate, out)
  }
  return out
}

export function find(root, predicate) {
  return findAll(root, predicate, [])[0]
}

export function textOf(node) {
  if (!node) return ''
  if (node.tag === '#text') return node.text
  return (node.children || []).map(textOf).join('')
}

/** Deepest-first search so an outer wrapper never shadows the element we want. */
export function findDeepest(root, predicate) {
  const all = findAll(root, predicate)
  return all.length ? all[all.length - 1] : undefined
}
