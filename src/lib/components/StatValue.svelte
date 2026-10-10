<script>
  /**
   * A stat such as cooldown / range / effect radius.
   *
   * Numeric progressions become per-rank pills; everything else (`Global`,
   * `0.25`, `4 – 1.33 (based on bonus attack speed)`) is shown verbatim, because
   * quietly rewriting those would make the page disagree with the wiki.
   */
  import { statParts, formatNumber } from '../format.js'

  let { label, stat, tone = 'default', showRanks = false } = $props()

  /**
   * Three shapes of value are possible:
   *   values -> rank progression (`18 / 14.5 / 11 / 7.5 / 4`)
   *   span   -> a range that shrinks/grows rather than ranking (`400 • 350`)
   *   plain  -> anything else, shown verbatim
   *
   * Numbers are grouped for readability (1000 -> 1,000) but never rounded, so the
   * displayed value always equals the wiki's.
   */
  function describe(value) {
    if (!value || !value.text) return { kind: 'plain' }
    const text = String(value.text).trim()

    if (text.includes('•') || text.includes('·')) {
      const bits = text.split(/\s*[•·]\s*/).map((s) => s.trim()).filter(Boolean)
      if (bits.length === 2 && bits.every((b) => /^\d+(\.\d+)?$/.test(b))) {
        return { kind: 'span', from: formatNumber(bits[0]), to: formatNumber(bits[1]) }
      }
    }

    const stats = statParts(value)
    if (stats.multi) {
      return { kind: 'values', values: stats.parts.map((p) => (p.isNumber ? formatNumber(p.text) : p.text)) }
    }
    return { kind: 'plain', text: formatNumberIfNumeric(text) }
  }

  /** `1200` -> `1,200`, but leave `Global`, `0.25` and prose untouched. */
  function formatNumberIfNumeric(text) {
    return /^\d{4,}$/.test(text) ? formatNumber(text) : text
  }

  const parsed = $derived(describe(stat))
</script>

{#if stat && stat.text}
  <div class="stat stat--{tone}">
    <span class="stat-label">{label}</span>
    <span class="stat-value">
      {#if parsed.kind === 'values'}
        <span class="rank-seq is-multi">
          {#each parsed.values as value, i (i)}
            {#if i > 0}<span class="rank-sep">/</span>{/if}
            <span class="rank-val" title={showRanks ? `Rank ${i + 1}` : undefined}>{value}</span>
          {/each}
        </span>
      {:else if parsed.kind === 'span'}
        <span class="span-value">
          <span class="rank-val">{parsed.from}</span>
          <span class="span-dash">–</span>
          <span class="rank-val">{parsed.to}</span>
        </span>
      {:else}
        <span class="plain-value">{parsed.text ?? stat.text}</span>
      {/if}
    </span>
  </div>
{/if}

<style>
  .stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .stat-label {
    color: var(--text-dim);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .stat-value {
    font-size: 15px;
    line-height: 1.3;
  }

  .stat--cooldown .plain-value,
  .stat--cooldown .rank-val {
    color: var(--gold-bright);
  }

  .stat--range .plain-value,
  .stat--range .rank-val {
    color: #9fd8ff;
  }

  .stat--radius .plain-value,
  .stat--radius .rank-val {
    color: #c3b3ff;
  }

  .plain-value {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .stat--cooldown .rank-seq.is-multi .rank-val {
    background: rgba(200, 162, 74, 0.14);
    border-color: rgba(200, 162, 74, 0.32);
  }

  .stat--range .rank-seq.is-multi .rank-val {
    background: rgba(74, 163, 216, 0.14);
    border-color: rgba(74, 163, 216, 0.32);
  }

  .span-value {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    font-weight: 600;
  }

  .span-dash {
    color: var(--text-dim);
    font-weight: 400;
  }
</style>
