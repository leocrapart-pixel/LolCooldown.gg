import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

/**
 * `TAURI_BUILD=1` switches the app into its desktop navigation mode.
 *
 * Champion pages are prerendered as flat files with no `__data.json` payloads, so
 * SvelteKit's client router has nothing to fetch on a route change. A full page
 * load always resolves instead, and it is what a desktop shell can serve:
 * Tauri's asset protocol maps `/Ashe` to `Ashe.html` (see tauri/src/manager
 * `get_asset`, which tries `{path}.html` before `{path}/index.html`).
 *
 * The web build keeps client-side routing.
 */
const desktop = process.env.TAURI_BUILD === '1'

export default defineConfig({
  plugins: [sveltekit()],
  define: {
    __OFFLINE_NAV__: JSON.stringify(desktop),
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
})
