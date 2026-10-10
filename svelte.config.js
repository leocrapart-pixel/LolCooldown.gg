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
