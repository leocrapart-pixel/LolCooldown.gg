<script>
  /**
   * Not-found page.
   *
   * A static host serves this for any unknown path. Two things are handled here
   * that a static build cannot handle on the server:
   *
   *   1. A shared link typed in the wrong case (`/ashe`, `/ASHE`) is matched
   *      case-insensitively and sent to the champion's canonical URL.
   *   2. Anything else gets the full champion search, so a wrong URL is still a
   *      useful page rather than a dead end.
   */
  import { page } from '$app/state'
  import { goto } from '$app/navigation'
  import ChampionSearch from '$lib/components/ChampionSearch.svelte'
  import { findChampion, championPath, champions } from '$lib/champions.js'

  let { status, error } = $props()

  let query = $state('')

  const requested = $derived(decodeURIComponent(page.url.pathname.replace(/^\/+|\/+$/g, '')))
  const match = $derived(status === 404 ? findChampion(requested) : undefined)

  $effect(() => {
    // Only for a single-segment path that resolves to a champion in some casing.
    if (status !== 404 || !match || requested.includes('/')) return
    const target = championPath(match)
    if (target !== page.url.pathname) {
      goto(target, { replaceState: true, noScroll: false })
    }
  })

  const message = $derived(error?.message ?? 'Something went wrong.')
</script>

<svelte:head>
  <title>{status} — CooldownLol.gg</title>
  {#if match}
    <link rel="canonical" href={championPath(match)} />
  {/if}
</svelte:head>

<section class="not-found">
  <p class="code">{status}</p>
  {#if match}
    <h1>Did you mean {match.name}?</h1>
    <p class="detail">
      <a href={championPath(match)}>Go to {match.name} →</a>
    </p>
  {:else}
    <h1>{status === 404 ? 'That champion page does not exist' : 'Something went wrong'}</h1>
    <p class="detail">{message}</p>
    {#if requested}
      <p class="path">Requested: <code>/{requested}</code></p>
    {/if}
  {/if}

  <div class="search-block">
    <h2>Search {champions.length} champions</h2>
    <ChampionSearch bind:query {champions} autofocus />
  </div>
</section>

<style>
  .not-found {
    max-width: 640px;
    padding: 30px 0 10px;
  }

  .code {
    margin: 0;
    color: var(--gold);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.12em;
  }

  h1 {
    margin: 6px 0 10px;
    font-size: 27px;
    letter-spacing: -0.02em;
  }

  h2 {
    margin: 0 0 10px;
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .detail {
    margin: 0 0 10px;
    color: var(--text-muted);
  }

  .path code {
    padding: 2px 6px;
    background: rgba(255, 255, 255, 0.07);
    border-radius: 4px;
    font-size: 13px;
  }

  .search-block {
    margin-top: 26px;
    padding-top: 22px;
    border-top: 1px solid var(--border);
  }
</style>
