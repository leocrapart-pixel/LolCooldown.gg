<script>
  import AbilityCard from '$lib/components/AbilityCard.svelte'
  import ChampionSearch from '$lib/components/ChampionSearch.svelte'
  import { championPath } from '$lib/champions.js'

  let { data } = $props()

  const champion = $derived(data.champion)
  const roster = $derived(data.champions)
  let query = $state('')
  let search = $state(null)

  const abilities = $derived(champion.abilities ?? [])
  const passive = $derived(abilities.filter((a) => a.slot === 'P'))
  const actives = $derived(abilities.filter((a) => a.slot !== 'P'))
  const ordered = $derived([...passive, ...actives])

  /**
   * A grouped ability (Hwei's spellbooks, Kha'Zix's evolutions) arrives as a
   * parent entry followed by one entry per alternate form. Sub-abilities share
   * their parent's slot, so the parent's name is keyed by slot.
   */
  const groupNames = $derived.by(() => {
    const map = new Map()
    for (const ability of ordered) {
      if (ability.kind === 'group' && ability.slot) map.set(ability.slot, ability.name)
    }
    return map
  })

  function jumpToSearch() {
    search?.focus()
  }
</script>

<svelte:head>
  <title>{champion.name} — cooldowns, ranges and radii | CooldownLol.gg</title>
  <meta
    name="description"
    content="{champion.name}{champion.title
      ? `, ${champion.title},`
      : ''} ability cooldowns, cast ranges and effect radii for every ability, with per-level values and full descriptions."
  />
  <link rel="canonical" href={championPath(champion)} />
</svelte:head>

<div class="layout">
  <aside class="sidebar">
    <ChampionSearch bind:this={search} bind:query champions={roster} activeSlug={champion.slug} />
  </aside>

  <main class="content">
    <header class="champion-head">
      {#if champion.iconUrl}
        <img
          class="portrait"
          src={champion.iconUrl}
          alt="{champion.name} portrait"
          width="104"
          height="104"
          decoding="async"
        />
      {:else}
        <div class="portrait portrait--fallback" aria-hidden="true">{champion.name.charAt(0)}</div>
      {/if}

      <div class="head-text">
        <h1>{champion.name}</h1>
        {#if champion.title}
          <p class="epithet">{champion.title}</p>
        {/if}
        <p class="source">
          <a href={champion.pageUrl} target="_blank" rel="noopener noreferrer">View on the League of Legends Wiki ↗</a>
          {#if champion.patch}<span class="patch">Patch {champion.patch}</span>{/if}
        </p>
      </div>
    </header>

    <nav class="jump" aria-label="Abilities">
      <button type="button" class="jump-search" onclick={jumpToSearch}>Search another champion</button>
      {#each abilities as ability (ability.id)}
        <a class="jump-link" href="#{ability.id}">
          {#if ability.iconUrl}
            <img src={ability.iconUrl} alt="" width="22" height="22" loading="lazy" decoding="async" />
          {/if}
          <span>{ability.name}</span>
        </a>
      {/each}
    </nav>

    {#if abilities.length === 0}
      <p class="no-abilities">
        No abilities could be extracted for {champion.name}. This usually means the wiki page layout changed — run
        <code>npm run scrape</code> to rebuild the dataset.
      </p>
    {:else}
      <section class="abilities">
        {#each ordered as ability (ability.id)}
          <div id={ability.id} class="anchor">
            <AbilityCard {ability} groupName={ability.kind === 'sub' ? (groupNames.get(ability.slot) ?? null) : null} />
          </div>
        {/each}
      </section>
    {/if}
  </main>
</div>

<style>
  .layout {
    display: grid;
    grid-template-columns: minmax(240px, 290px) minmax(0, 1fr);
    gap: 30px;
    align-items: start;
  }

  .sidebar {
    position: sticky;
    top: 16px;
  }

  .content {
    min-width: 0;
  }

  .champion-head {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 20px;
  }

  .portrait {
    width: 104px;
    height: 104px;
    border-radius: 12px;
    border: 2px solid var(--gold);
    box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55);
    object-fit: cover;
    flex: none;
  }

  .portrait--fallback {
    display: grid;
    place-items: center;
    background: var(--bg-card);
    color: var(--text-dim);
    font-size: 40px;
    font-weight: 700;
  }

  .head-text {
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }

  .epithet {
    margin: 3px 0 0;
    color: var(--gold-bright);
    font-size: 14px;
    font-style: italic;
  }

  .source {
    margin: 8px 0 0;
    font-size: 12.5px;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .patch {
    padding: 1px 7px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 11.5px;
  }


  .jump {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-bottom: 20px;
  }

  .jump-search {
    padding: 5px 11px;
    border-radius: 20px;
    border: 1px dashed var(--border-strong);
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }

  .jump-search:hover {
    border-color: var(--gold);
    color: var(--gold-bright);
  }

  .jump-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 11px 4px 5px;
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 12.5px;
    text-decoration: none;
  }

  .jump-link:hover {
    border-color: var(--border-strong);
    color: #fff;
    text-decoration: none;
  }

  .jump-link img {
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .abilities {
    display: grid;
    gap: 14px;
  }

  .anchor {
    scroll-margin-top: 16px;
  }

  .no-abilities {
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-muted);
  }

  code {
    padding: 1px 5px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 4px;
    font-size: 12.5px;
  }

  @media (max-width: 940px) {
    .layout {
      grid-template-columns: 1fr;
    }

    .sidebar {
      position: static;
    }
  }
</style>
