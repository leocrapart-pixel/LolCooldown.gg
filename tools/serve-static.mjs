/**
 * A minimal static host for the built site.
 *
 *   node tools/serve-static.mjs [port]
 *
 * This exists so the render checks can be run against the same behaviour a real
 * static host provides — crucially, serving `404.html` (with a 404 status) for an
 * unknown path, which is what GitHub Pages, Netlify, Cloudflare Pages and
 * `python -m http.server`-style hosts do. `vite preview` does not do this, so
 * testing against it would not exercise the not-found path at all.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'build')
// Deliberately not 4190 (Zabbix) or other well-known ports: fetch/undici
// refuses a list of "bad ports" outright, and a bad default would make every
// check fail with a bare "bad port".
const port = Number(process.argv[2] || 4321)

/**
 * Ports `fetch` refuses to connect to (the Fetch spec's "bad port" list, which
 * undici implements). Binding one of these makes every check fail with an opaque
 * "bad port", so it is worth catching here with a message that says why.
 * Not exhaustive — the full list is in the Fetch spec — but covers the ranges
 * that are plausible to pick by hand.
 */
const BAD_PORTS = new Set([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 138, 139, 143, 161, 179, 389, 427,
  465, 512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990,
  993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667,
  6668, 6669, 6679, 6697, 10080,
])

if (BAD_PORTS.has(port)) {
  console.error(
    `Refusing to bind port ${port}: fetch/undici treats it as a "bad port" and will not connect ` +
      `to it, so the checks would fail with an opaque error. Pick another port (for example 4321).`,
  )
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

async function exists(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let pathname = decodeURIComponent(url.pathname)

  // Keep traversal inside the build directory.
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '')
  const candidates = []
  if (safe.endsWith('/')) candidates.push(join(ROOT, safe, 'index.html'))
  else candidates.push(join(ROOT, safe), join(ROOT, `${safe}.html`), join(ROOT, safe, 'index.html'))

  for (const candidate of candidates) {
    if (!candidate.startsWith(ROOT)) continue
    if (await exists(candidate)) {
      const body = await readFile(candidate)
      res.writeHead(200, { 'Content-Type': TYPES[extname(candidate)] || 'application/octet-stream' })
      res.end(body)
      return
    }
  }

  const notFound = join(ROOT, '404.html')
  if (await exists(notFound)) {
    const body = await readFile(notFound)
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(body)
    return
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' })
  res.end('Not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`static host for ${ROOT} on http://127.0.0.1:${port}`)
})
