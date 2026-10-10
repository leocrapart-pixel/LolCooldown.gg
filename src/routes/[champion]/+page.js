import { error } from '@sveltejs/kit'
import { findChampion, champions, meta } from '$lib/champions.js'

/**
 * Resolve `/ashe`, `/Ashe` or `/miss_fortune` to the canonical champion and
 * rewrite the URL to the champion's own casing, so every shared link is stable.
 */
export function load({ params }) {
  const champion = findChampion(params.champion)

  if (!champion) {
    error(404, {
      message: `No champion called “${decodeURIComponent(params.champion)}” was found.`,
    })
  }

  return {
    champion,
    champions,
    meta,
    /** Set when the URL casing differed from the canonical slug. */
    canonical: champion.slug,
    requested: params.champion,
  }
}
