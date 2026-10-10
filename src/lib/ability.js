/**
 * Presentation logic for a single ability: which stats are headline numbers,
 * which are supporting detail, and how a compound effect radius is described.
 */

const APEX_ORDER = [
  { key: 'cooldown', label: 'Cooldown', tone: 'cooldown', get: (a) => a.cooldown },
  { key: 'effectRadius', label: 'Effect radius', tone: 'radius', get: (a) => a.effectRadius },
  { key: 'range', label: 'Range', tone: 'range', get: (a) => a.range },
]

/** The counts the page is asked to show for every ability, when present. */
export function apexStats(ability) {
  const out = []
  for (const def of APEX_ORDER) {
    const stat = def.get(ability)
    if (stat && stat.text) {
      out.push({ key: def.key, label: def.label, tone: def.tone, stat })
    }
  }
  return out
}

/** Stats the wiki lists but that aren't headline numbers (cost, cast time, ...). */
export function extraStats(ability) {
  const skip = new Set(['cooldown', 'static cooldown', 'effect radius', 'range', 'target range'])
  return Object.entries(ability.stats ?? {})
    .filter(([key]) => !skip.has(key))
    .map(([key, text]) => ({ key, label: labelFor(key), stat: { text } }))
}

export function hasApexStats(ability) {
  return apexStats(ability).length > 0
}

function labelFor(key) {
  const overrides = {
    cost: 'Cost',
    'cast time': 'Cast time',
    recharge: 'Recharge',
    width: 'Width',
    angle: 'Angle',
    speed: 'Speed',
    'target immunity': 'Target immunity',
    'queue threshold': 'Queue threshold',
    'thrust cast time': 'Thrust cast time',
    'whirlwind cast time': 'Whirlwind cast time',
  }
  return (
    overrides[key] ??
    key
      .split(/[\s.]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  )
}

