<script>
  /**
   * Champion search: filters the full roster client-side (the whole dataset is
   * only a few hundred KB and already bundled) and links each result to its own
   * shareable URL.
   */
  import { searchChampions, championPath } from '../champions.js'

  let { query = $bindable(''), champions, activeSlug = null, autofocus = false } = $props()

  const results = $derived(searchChampions(query, 200))

  let inputEl = $state(null)

  export function focus() {
    inputEl?.focus()
    inputEl?.select()
  }

  function onKeydown(event) {
    if (event.key === 'Escape' && query) {
      event.preventDefault()
      query = ''
    }
  }
</script>

<div class="search">
  <div class="field">
    <span class="field-icon" aria-hidden="true">⌕</span>
    <input
      bind:this={inputEl}
      bind:value={query}
      type="search"
      placeholder="Search a champion…  (Ashe, Yasuo, Miss Fortune)"
      aria-label="Search champions"
      autocomplete="off"
      spellcheck="false"
      {autofocus}
      onkeydown={onKeydown}
    />
    {#if query}
      <button type="button" class="clear" onclick={() => (query = '')} aria-label="Clear search">×</button>
    {/if}
  </div>

  <p class="count" aria-live="polite">
    {#if query}
      {results.length}
      {results.length === 1 ? 'champion' : 'champions'} matching “{query}”
    {:else}
      {champions.length} champions
    {/if}
  </p>

  {#if results.length === 0}
    <p class="empty">No champion matches “{query}”. Check the spelling, or clear the search to browse all.</p>
  {:else}
    <ul class="results">
      {#each results as champion (champion.slug)}
        <li>
          <a href={championPath(champion)} class="chip" class:active={champion.slug === activeSlug}>
            {#if champion.iconUrl}
              <img src={champion.iconUrl} alt="" width="30" height="30" loading="lazy" decoding="async" />
            {:else}
              <span class="chip-fallback" aria-hidden="true">{champion.name.charAt(0)}</span>
            {/if}
            <span class="chip-text">
              <span class="chip-name">{champion.name}</span>
              {#if champion.title}<span class="chip-title">{champion.title}</span>{/if}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .field {
    position: relative;
    display: flex;
    align-items: center;
  }

  .field-icon {
    position: absolute;
    left: 12px;
    color: var(--text-dim);
    font-size: 16px;
    pointer-events: none;
  }

  input {
    width: 100%;
    padding: 11px 34px 11px 34px;
    background: var(--bg-input);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }

  input::placeholder {
    color: var(--text-dim);
  }

  input:focus {
    outline: none;
    border-color: var(--gold);
    box-shadow: 0 0 0 3px rgba(200, 162, 74, 0.14);
  }

  /* Hide the native search clear button; a styled one is provided instead. */
  input::-webkit-search-cancel-button {
    appearance: none;
  }

  .clear {
    position: absolute;
    right: 8px;
    width: 20px;
    height: 20px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.08);
    border: 0;
    border-radius: 50%;
    color: var(--text-muted);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .clear:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }

  .count {
    margin: 0;
    color: var(--text-dim);
    font-size: 12px;
  }

  .empty {
    margin: 4px 0 0;
    color: var(--text-muted);
    font-size: 13.5px;
  }

  .results {
    list-style: none;
    margin: 2px 0 0;
    padding: 0 4px 0 0;
    display: grid;
    gap: 5px;
    overflow-y: auto;
    max-height: 62vh;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 9px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    color: var(--text);
    text-decoration: none;
    min-width: 0;
  }

  .chip:hover {
    background: rgba(255, 255, 255, 0.055);
    text-decoration: none;
  }

  .chip.active {
    background: rgba(200, 162, 74, 0.12);
    border-color: rgba(200, 162, 74, 0.4);
  }

  .chip img {
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    flex: none;
  }

  .chip-fallback {
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--text-dim);
    font-weight: 700;
    flex: none;
  }

  .chip-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .chip-name {
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chip-title {
    color: var(--text-dim);
    font-size: 11px;
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
