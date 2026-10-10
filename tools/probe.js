/**
 * Dev probe: dump the real DOM structure of one champion's ability cards.
 * Usage: node tools/probe.js [Champion] [localHtmlFile]
 */
import { readFileSync } from 'node:fs'
import { parseHtml, findAll, find, hasClass, textOf, isElement } from './lib/html.js'

const champion = process.argv[2] || 'Ashe'
const local = process.argv[3]

let html
if (local) {
  html = readFileSync(local, 'utf8')
} else {
  const res = await fetch(`https://wiki.leagueoflegends.com/en-us/${champion}`, {
    headers: { 'User-Agent': 'CooldownLol/1.0 (build-time data extraction)' },
  })
  html = await res.text()
  console.log('fetched', champion, res.status, html.length)
}

const root = parseHtml(html)

function serialize(node, depth = 0) {
  if (!isElement(node)) return node.text || ''
  const a = node.attrs || {}
  const bits = [node.tag]
  if (a.class) bits.push(`class="${a.class}"`)
  if (a.id) bits.push(`id="${a.id}"`)
  if (a.href) bits.push(`href="${a.href}"`)
  if (a.src) bits.push(`src="${a.src}"`)
  if (a.style) bits.push(`style="${a.style}"`)
  if (a['data-tip']) bits.push(`data-tip="${a['data-tip']}"`)
  if (a.width) bits.push(`width="${a.width}"`)
  const inner = (node.children || []).map((c) => serialize(c, depth + 1)).join('')
  return `<${bits.join(' ')}>${inner}</${node.tag}>`
}

const cards = findAll(root, (n) => n.tag === 'div' && n.attrs.id && (n.attrs.class || '').includes('skill_'))
console.log('\n=== cards ===')
console.log(cards.map((c) => `${c.attrs.id} (class=${c.attrs.class})`).join('\n'))

for (const card of cards.slice(0, 2)) {
  console.log(`\n\n########## ${card.attrs.id} ##########`)

  console.log('\n--- stat rows ---')
  for (const stat of findAll(card, (n) => hasClass(n, 'ability-info-stats__stat'))) {
    const label = find(stat, (n) => hasClass(n, 'ability-info-stats__stat-label'))
    const value = find(stat, (n) => hasClass(n, 'ability-info-stats__stat-value'))
    console.log(' ', JSON.stringify(textOf(label).trim()), '=>', JSON.stringify(textOf(value).trim()))
  }

  const json = find(card, (n) => hasClass(n, 'ability-json'))
  console.log('\n--- .ability-json text (1200) ---')
  console.log(json ? textOf(json).slice(0, 1200) : 'NOT FOUND')

  console.log('\n--- .ability-json serialized (1000) ---')
  console.log(json ? serialize(json).slice(0, 1000) : 'n/a')

  const content = find(card, (n) => hasClass(n, 'ability-info-content'))
  console.log('\n--- .ability-info-content serialized (1500) ---')
  console.log(content ? serialize(content).slice(0, 1500) : 'n/a')

  const rows = findAll(card, (n) => hasClass(n, 'ability-info-row'))
  console.log('\n--- ability-info-row[0] serialized (800) ---')
  console.log(rows[0] ? serialize(rows[0]).slice(0, 800) : 'n/a')

  const icon = find(card, (n) => hasClass(n, 'ability-info-icon'))
  console.log('\n--- .ability-info-icon serialized (500) ---')
  console.log(icon ? serialize(icon).slice(0, 500) : 'n/a')

  const tabs = findAll(root, (n) => hasClass(n, 'tabbertab'))
  console.log('\n--- tabbertab titles in page ---')
  console.log(tabs.map((t) => JSON.stringify(t.attrs['data-title'])).join(', '))
  break
}
