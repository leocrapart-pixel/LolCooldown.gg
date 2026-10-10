/**
 * Post-build step: give the 404 fallback real content.
 *
 * `adapter-static` writes `404.html` as the bare SvelteKit application shell, so
 * an unknown URL shows a blank page until the client bundle runs, and nothing at
 * all if JavaScript is blocked. The error page itself is rendered by the client,
 * which means its markup cannot be server-rendered without risking a hydration
 * mismatch.
 *
 * A `<noscript>` block avoids that problem entirely: browsers never hydrate
 * inside it, so the client is unaffected when JavaScript is available, yet the
 * served HTML (and therefore crawlers, and anyone with JavaScript disabled)
 * still gets a titled page linking to every champion.
 *
 *   node tools/postbuild.mjs
 */
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FILE = join(ROOT, 'build', '404.html')
const DATA = join(ROOT, 'src', 'lib', 'data', 'champions.json')

if (!existsSync(FILE)) {
  console.error(`No ${FILE} — run "npm run build" first.`)
  process.exit(1)
}

const { champions } = JSON.parse(await readFile(DATA, 'utf8'))
let html = await readFile(FILE, 'utf8')

const MARKER = '<!--cooldownlol:noscript-->'
if (html.includes(MARKER)) {
  console.log('404.html already annotated; nothing to do.')
  process.exit(0)
}

const escape = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const links = champions
  .map((c) => `<li><a href="/${escape(c.slug)}">${escape(c.name)}</a></li>`)
  .join('')

const block = `${MARKER}
    <noscript>
      <div style="max-width:900px;margin:0 auto;padding:32px 20px;font:15px/1.6 'Segoe UI',system-ui,sans-serif;color:#e8eef7;background:#070c14">
        <h1 style="font-size:26px;margin:0 0 6px">Page not found</h1>
        <p style="color:#93a4bd;margin:0 0 4px">
          This champion page does not exist. Pick a champion below, or enable JavaScript for the full
          search experience.
        </p>
        <p style="color:#66799a;font-size:13px;margin:0 0 18px">
          CooldownLol.gg — ability cooldowns, ranges and effect radii for ${champions.length} League of Legends champions.
        </p>
        <ul style="columns:4;column-gap:24px;list-style:none;padding:0;margin:0;font-size:13.5px">${links}</ul>
      </div>
    </noscript>`

html = html.replace('</body>', `${block}\n  </body>`)
await writeFile(FILE, html)
console.log(`Annotated build/404.html with a ${champions.length}-champion noscript fallback.`)
