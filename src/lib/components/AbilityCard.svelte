<script>
  /**
   * One champion ability: icon, name, the requested headline numbers
   * (cooldown / effect radius / range) and a collapsed description.
   */
  import Description from './Description.svelte'
  import StatValue from './StatValue.svelte'
  import { hasApexStats, apexStats, extraStats } from '../ability.js'

  let { ability, open = false, groupName = null } = $props()

  // Local UI state, seeded from the (optional) externally controlled value.
  let expanded = $state(open)

  const apex = $derived(hasApexStats(ability) ? apexStats(ability) : [])
  const extras = $derived(extraStats(ability))
  const hasDropdown = $derived(ability.description.length > 0 || ability.leveling.length > 0)

  const slotLabel = $derived(ability.slot === 'P' ? 'Passive' : ability.slot ? `Ability ${ability.slot}` : 'Ability')
  const caption = $derived(
    ability.kind === 'sub'
      ? `${slotLabel} · alternate form`
      : ability.kind === 'group'
        ? `${slotLabel} · grouped forms`
        : slotLabel,
  )
</script>

<article class="ability" class:is-open={expanded} class:is-sub={ability.kind === 'sub'}>
  <header class="ability-head">
    <div class="icon-wrap">
      {#if ability.iconUrl}
        <img src={ability.iconUrl} alt="" width="64" height="64" loading="lazy" decoding="async" />
      {:else}
        <div class="icon-fallback" aria-hidden="true">{ability.name.charAt(0)}</div>
      {/if}
    </div>

    <div class="head-text">
      <h2>
        {#if ability.slot}
          <span class="slot" title={slotLabel}>{ability.slot}</span>
        {/if}
        <span class="ability-name">{ability.name}</span>
      </h2>
      <p class="slot-caption">{caption}</p>
      {#if ability.kind === 'sub' && groupName}
        <p class="group-note">Part of {groupName}</p>
      {/if}
    </div>
  </header>

  {#if apex.length || extras.length}
    <div class="stats">
      {#each apex as stat (stat.key)}
        <StatValue label={stat.label} stat={stat.stat} tone={stat.tone} showRanks />
      {/each}
      {#each extras as stat (stat.key)}
        <StatValue label={stat.label} stat={stat.stat} tone="default" />
      {/each}
    </div>
  {/if}

  {#if hasDropdown}
    <div class="disclosure">
      <button
        type="button"
        class="disclosure-toggle"
        aria-expanded={expanded}
        aria-controls={`ability-body-${ability.id}`}
        onclick={() => (expanded = !expanded)}
      >
        <span class="chevron" aria-hidden="true">{expanded ? '▾' : '▸'}</span>
        <span>{expanded ? 'Hide description' : 'Show description'}</span>
      </button>

      <!--
        The body is always rendered and hidden with the `hidden` attribute rather
        than removed from the DOM. That keeps descriptions, per-level stats and
        wiki highlight markup in the served HTML (crawlable, and readable with
        JavaScript disabled) while still being collapsed for a normal visitor.
      -->
      <div class="disclosure-body" id={`ability-body-${ability.id}`} hidden={!expanded}>
        {#each ability.description as block, i (i)}
          <Description html={block.html} />
        {/each}

        {#if ability.leveling.length}
          <dl class="leveling">
            {#each ability.leveling as row, i (i)}
              <div class="leveling-row">
                <dt>{row.label}</dt>
                <dd><Description html={row.html} /></dd>
              </div>
            {/each}
          </dl>
        {/if}
      </div>
    </div>
  {/if}
</article>

<style>
  .ability {
    background: linear-gradient(180deg, rgba(23, 38, 62, 0.82), rgba(13, 22, 38, 0.88));
    border: 1px solid var(--border);
    border-left: 3px solid var(--border-strong);
    border-radius: var(--radius);
    padding: 16px 18px;
    transition: border-color 0.15s ease;
  }

  .ability:hover {
    border-color: var(--border-strong);
  }

  .ability.is-open {
    border-left-color: var(--gold);
  }

  /* Alternate forms of a grouped ability read as an indented continuation. */
  .ability.is-sub {
    margin-left: 18px;
    background: linear-gradient(180deg, rgba(18, 30, 50, 0.7), rgba(11, 18, 32, 0.78));
  }

  .group-note {
    margin: 3px 0 0;
    color: var(--text-dim);
    font-size: 11.5px;
    font-style: italic;
  }

  .ability-head {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .icon-wrap img {
    display: block;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  }

  .icon-fallback {
    width: 64px;
    height: 64px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    border: 1px solid var(--border-strong);
    background: rgba(255, 255, 255, 0.04);
    color: var(--text-dim);
    font-size: 24px;
    font-weight: 700;
  }

  .head-text {
    min-width: 0;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 9px;
    margin: 0;
    font-size: 19px;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .slot {
    display: inline-grid;
    place-items: center;
    min-width: 22px;
    height: 22px;
    padding: 0 5px;
    border-radius: 5px;
    background: rgba(200, 162, 74, 0.16);
    border: 1px solid rgba(200, 162, 74, 0.4);
    color: var(--gold-bright);
    font-size: 12px;
    font-weight: 700;
    flex: none;
  }

  .ability-name {
    min-width: 0;
  }

  .slot-caption {
    margin: 2px 0 0;
    color: var(--text-dim);
    font-size: 11.5px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    font-weight: 600;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(122px, 1fr));
    gap: 12px 20px;
    margin-top: 15px;
    padding-top: 14px;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }

  .disclosure {
    margin-top: 14px;
  }

  .disclosure-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.035);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: #b8c9e0;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
  }

  .disclosure-toggle:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
  }

  .chevron {
    color: var(--gold);
    font-size: 11px;
    width: 10px;
  }

  .disclosure-body {
    margin-top: 12px;
    padding: 14px 16px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: var(--radius-sm);
  }

  /* `hidden` is used so the content stays in the HTML; keep it authoritative. */
  .disclosure-body[hidden] {
    display: none;
  }

  .leveling {
    margin: 14px 0 0;
    padding-top: 12px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    display: grid;
    gap: 7px;
  }

  .leveling-row {
    display: grid;
    grid-template-columns: minmax(120px, 190px) 1fr;
    gap: 12px;
    align-items: baseline;
  }

  dt {
    color: var(--text-muted);
    font-size: 12.5px;
    font-weight: 600;
  }

  dd {
    margin: 0;
    font-size: 14px;
  }

  @media (max-width: 620px) {
    .leveling-row {
      grid-template-columns: 1fr;
      gap: 2px;
    }
  }
</style>
