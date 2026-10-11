/**
 * A minimal static host for a built site.
 *
 *   node tools/serve-static.mjs [port] [rootDir]
 *
 * Defaults to the web build in `build/`. Point it at the staged Neutralino
 * resource tree to exercise the desktop app's page resolution with the same
 * tooling:
 *
 *   node tools/serve-static.mjs 4190 neutralino/resources/app
 *
 * This exists so the render checks can be run against the same behaviour a real
 * static host provides — crucially, serving `404.html` (with a 404 status) for an
 * unknown path, which is what GitHub Pages, Netlify, Cloudflare Pages and
 * `python -m http.server`-style hosts do. `vite preview` does not do this, so
 * testing against it would not exercise the not-found path at all.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, extname, normalize, isAbsolute } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const PROJECT = join(dirname(fileURLToPath(import.meta.url)), '..')
const rootArg = process.argv[3]
const ROOT = rootArg
  ? isAbsolute(rootArg)
    ? rootArg
    : join(PROJECT, rootArg)
  : join(PROJECT, 'build')
const port = Number(process.argv[2] || 4190)

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
