/**
 * Presentation logic for a single ability.
 *
 * Only three stats are surfaced: cooldown, effect radius and range. Everything
 * else the wiki lists for an ability (cost, cast time, speed, width, angle,
 * recharge, ...) is deliberately not shown — it is still in the dataset, so
 * adding a field back is a one-line change here.
 */

const APEX_ORDER = [
  { key: 'cooldown', label: 'Cooldown', tone: 'cooldown', get: (a) => a.cooldown },
  { key: 'effectRadius', label: 'Effect radius', tone: 'radius', get: (a) => a.effectRadius },
  { key: 'range', label: 'Range', tone: 'range', get: (a) => a.range },
]

/** The headline stats for an ability, in display order, skipping any it lacks. */
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


