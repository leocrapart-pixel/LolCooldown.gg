import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * Fully static output: every champion page is prerendered at build time, so the
 * site is a plain folder of HTML that can be hosted anywhere and shared by URL.
 */
/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Champion pages are written as flat files (`build/Ashe.html`) and served at
    // `/Ashe` with no trailing slash. SvelteKit's default relative asset paths
    // (`./_app/...`) resolve against `/Ashe`, which is a file and not a
    // directory, so the browser would request `/Ashe/_app/...` and get a 404 —
    // leaving the live site with no CSS and no JavaScript. Root-relative paths
    // avoid that, and are correct for hosting at a domain root.
    paths: { relative: false },
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html',
      precompress: false,
      strict: false,
    }),
    prerender: {
      // The index links every champion, so link-crawling is enough.
      crawl: true,
      entries: ['*'],
      handleHttpError: 'warn',
    },
  },
}

export default config
