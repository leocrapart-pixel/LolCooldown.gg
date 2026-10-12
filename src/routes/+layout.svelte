<script>
  import '../app.css'

  let { children } = $props()

  /**
   * `__OFFLINE_NAV__` is injected by vite.config.js and is true in the desktop
   * build only. It opts out of SvelteKit's client-side routing so every link is a
   * normal page load: champion pages are prerendered flat files with no
   * `__data.json` for the router to fetch, and a real navigation always resolves
   * in the desktop shell.
   */
  const offlineNav = typeof __OFFLINE_NAV__ !== 'undefined' && __OFFLINE_NAV__

  /**
   * SvelteKit reads `data-sveltekit-preload-data` from the anchor (or an
   * ancestor) when a link is clicked, so setting it on <body> before hydration
   * completes is enough. `<svelte:body>` cannot carry data attributes, hence the
   * explicit effect.
   */
  $effect(() => {
    document.body.dataset.sveltekitPreloadData = offlineNav ? 'off' : 'hover'
  })
</script>

<div class="shell">
  <header class="site-header">
    <a class="brand" href="/">
      Cooldown<span class="brand-gold">Lol</span><span class="brand-tld">.gg</span>
    </a>
    <p class="site-tagline">
      Ability cooldowns, cast ranges and effect radii for every League of Legends champion
    </p>
  </header>

  {@render children()}

  <footer class="footer">
    <p>
      Ability data extracted from the
      <a href="https://wiki.leagueoflegends.com/en-us/List_of_champions" target="_blank" rel="noopener noreferrer"
        >League of Legends Wiki</a
      >, which is available under
      <a href="https://meta.weirdgloop.org/w/Meta:Copyrights" target="_blank" rel="noopener noreferrer"
        >CC BY-SA 3.0</a
      >. Numbers can change between patches — the wiki page for each champion is the authoritative source.
    </p>
    <p>
      CooldownLol.gg isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone
      officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are
      trademarks or registered trademarks of Riot Games, Inc.
    </p>
  </footer>
</div>
