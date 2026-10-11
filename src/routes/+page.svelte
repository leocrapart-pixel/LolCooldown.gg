<script>
  import ChampionSearch from '$lib/components/ChampionSearch.svelte'
  import { formatDate } from '$lib/format.js'
  import { champions, meta } from '$lib/champions.js'

  // Read straight from the bundled dataset rather than through a `load`
  // function. Those are identical values, and this keeps the route free of a
  // server data dependency — which matters for the desktop shell, where
  // SvelteKit's client router would otherwise probe `/__data.json` for every
  // navigation and get a 404 from Neutralino's local server.

  let query = $state('')
</script>

<svelte:head>
  <title>CooldownLol.gg — League of Legends ability cooldowns, ranges and radii</title>
  <meta
    name="description"
    content="Search any League of Legends champion to see every ability's cooldown, cast range and effect radius, with per-level values and full descriptions."
  />
</svelte:head>

<h1 class="page-title">Champion cooldowns, ranges &amp; radii</h1>
<p class="lede">
  Pick a champion to see each ability's cooldown, effect radius and range, with the per-level numbers and the full
  description on hand when you need it.
</p>

<ChampionSearch bind:query {champions} autofocus />

<p class="provenance">
  {meta.count} champions in the dataset, extracted from the League of Legends Wiki on
  {formatDate(meta.generatedAt)}.
</p>

<style>
  .page-title {
    margin: 0 0 6px;
    font-size: 30px;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .lede {
    margin: 0 0 22px;
    max-width: 62ch;
    color: var(--text-muted);
    font-size: 15px;
  }

  .provenance {
    margin: 18px 0 0;
    color: var(--text-dim);
    font-size: 12.5px;
  }
</style>
