/**
 * Unit checks for the pure presentation helpers in src/lib/format.js.
 *
 *   node tools/check-format.mjs
 *
 * These run without a DOM or a test runner, which is deliberate: the helpers
 * are pure and the failure modes that matter (mangling rank numbers, breaking
 * HTML tags) are all visible from the strings.
 */
import { statParts, markRankNumbers, formatDate } from '../src/lib/format.js'

let checks = 0
const failures = []

function eq(actual, expected, label) {
  checks++
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) failures.push(`${label}\n     expected ${b}\n     actual   ${a}`)
}

function ok(condition, label) {
  checks++
  if (!condition) failures.push(label)
}

/* --------------------------------------------------------- statParts ------ */

eq(statParts(null), { parts: [], multi: false }, 'null stat -> empty')
eq(statParts({ text: '' }), { parts: [], multi: false }, 'empty text -> empty')

eq(
  statParts({ text: '18 / 14.5 / 11 / 7.5 / 4' }),
  {
    parts: [
      { text: '18', isNumber: true },
      { text: '14.5', isNumber: true },
      { text: '11', isNumber: true },
      { text: '7.5', isNumber: true },
      { text: '4', isNumber: true },
    ],
    multi: true,
  },
  'cooldown splits into per-rank parts',
)

// `400 • 350` is a span, not a rank progression — StatValue decides that, so
// statParts must still report the two numeric parts.
eq(
  statParts({ text: '400 • 350' }).parts.map((p) => p.text),
  ['400', '350'],
  'bullet-separated values split',
)

eq(
  statParts({ text: 'Global' }),
  { parts: [{ text: 'Global', isNumber: false }], multi: false },
  'non-numeric value stays whole',
)

eq(
  statParts({ text: '100 / 80 / 60' }).multi,
  true,
  'ultimate cooldown is multi',
)

eq(statParts({ text: '0.25' }).multi, false, 'a single number is not multi')

eq(
  statParts({ text: '4 – 1.33 (based on bonus attack speed)' }).multi,
  false,
  'prose-scaled cooldown is not split',
)

/* ------------------------------------------------------ markRankNumbers --- */

eq(
  markRankNumbers('dealing 60 / 95 / 130 / 165 / 200 damage'),
  'dealing <span class="rank-seq is-multi"><span class="rank-val">60</span><span class="rank-sep">/</span><span class="rank-val">95</span><span class="rank-sep">/</span><span class="rank-val">130</span><span class="rank-sep">/</span><span class="rank-val">165</span><span class="rank-sep">/</span><span class="rank-val">200</span></span> damage',
  'rank progression is wrapped',
)

eq(markRankNumbers('a single 42 number'), 'a single 42 number', 'single number untouched')

eq(
  markRankNumbers('physical damage / magic damage'),
  'physical damage / magic damage',
  'prose slash untouched',
)

// Tags must survive: a number inside an attribute or tag name is not text.
eq(
  markRankNumbers('<span class="hl hl--physical" style="color: #FF8C34">1 / 2</span>'),
  '<span class="hl hl--physical" style="color: #FF8C34"><span class="rank-seq is-multi"><span class="rank-val">1</span><span class="rank-sep">/</span><span class="rank-val">2</span></span></span>',
  'attributes are not matched',
)

ok(
  !markRankNumbers('<a href="/en-us/Ashe">Ashe</a>').includes('rank-seq'),
  'a lone link is untouched',
)

eq(markRankNumbers(''), '', 'empty html stays empty')
eq(markRankNumbers(undefined), '', 'undefined html becomes empty')

// Text containing angle brackets that are already escaped must not be re-parsed.
eq(
  markRankNumbers('5 &lt; 10'),
  '5 &lt; 10',
  'escaped comparison untouched',
)

// A rank progression split across an inline element boundary is left alone
// rather than being mangled into mismatched tags.
const acrossTags = markRankNumbers('<span>60</span> / <span>95</span>')
ok(acrossTags.includes('<span>60</span>'), 'element boundaries preserved (start)')
ok(acrossTags.includes('<span>95</span>'), 'element boundaries preserved (end)')

/* ---------------------------------------------------------- formatDate ---- */

eq(formatDate('2026-10-10T11:15:52.931Z'), 'Oct 10, 2026', 'iso date formatted')
eq(formatDate('not a date'), '', 'invalid date is blank')
eq(formatDate(undefined), '', 'missing date is blank')

/* ------------------------------------------------------------- report ---- */

console.log(`${checks} format checks run.`)
if (failures.length) {
  console.error(`\nFAILED — ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('All format checks passed.')
