/**
 * Checks for the Tauri desktop packaging.
 *
 *   node tools/check-desktop.mjs
 *
 * None of this needs Rust or a Windows machine: it verifies the coupling between
 * the SvelteKit build output and the Tauri configuration, which is where these
 * things actually break.
 *
 *   1. `frontendDist` really points at the SvelteKit build output, and that
 *      output exists.
 *   2. Champion pages are flat files (`Ashe.html`). Tauri's asset protocol
 *      resolves `/Ashe` by trying `{path}.html` before `{path}/index.html`
 *      (tauri/src/manager `get_asset`), so the flat layout is what makes
 *      navigation work — if it ever became directory-shaped, every link would
 *      fall through to the SPA fallback.
 *   3. Asset URLs are root-relative, so they resolve against the `tauri://`
 *      origin rather than being interpreted relative to a page path.
 *   4. `tauri.conf.json` is coherent: Windows-only bundle targets, icons that
 *      exist, a real app identifier, and a usable window.
 *   5. The navigation mode compiled into the client bundle is reported, so it is
 *      visible which variant the last build produced.
 */
import { readFile, readdir, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CONF = join(ROOT, 'src-tauri', 'tauri.conf.json')

let checks = 0
const failures = []
const notes = []
const ok = (condition, label) => {
  checks++
  if (!condition) failures.push(label)
}
const note = (m) => notes.push(m)

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/* -------------------------------------------------------------- config ---- */

if (!existsSync(CONF)) {
  console.error('src-tauri/tauri.conf.json is missing — the desktop app is not set up.')
  process.exit(1)
}

const conf = JSON.parse(await readFile(CONF, 'utf8'))

ok(
  Boolean(conf.identifier) && conf.identifier.includes('.') && /^[a-z0-9.]+$/i.test(conf.identifier),
  `identifier looks like a reverse-DNS id (${conf.identifier})`,
)
ok(conf.identifier !== 'com.tauri.dev', 'identifier is not the scaffold default')
ok(conf.productName === 'CooldownLol.gg', `product name is CooldownLol.gg (${conf.productName})`)

const targets = Array.isArray(conf.bundle?.targets) ? conf.bundle.targets : [conf.bundle?.targets]
ok(
  targets.every((t) => ['nsis', 'msi'].includes(t)),
  `bundle targets are Windows installers (${targets.join(', ')})`,
)
ok(conf.bundle?.active === true, 'bundling is enabled')
ok(
  conf.bundle?.windows?.nsis?.installMode === 'currentUser',
  'installer installs per-user, so no administrator rights are needed',
)

const icons = conf.bundle?.icon ?? []
ok(icons.some((i) => i.endsWith('.ico')), 'icon set includes an .ico for Windows')
for (const icon of icons) {
  ok(await exists(join(ROOT, 'src-tauri', icon)), `icon exists: ${icon}`)
}

const window = conf.app?.windows?.[0] ?? {}
ok(window.title === 'CooldownLol.gg', `window title is CooldownLol.gg (${window.title})`)
ok(
  window.width >= 1000 && window.height >= 700,
  `window is a usable size (${window.width}x${window.height})`,
)
ok(window.resizable !== false, 'window is resizable')
ok(Boolean(conf.app?.security?.csp), 'a CSP is configured')

/* ------------------------------------------------- frontendDist coupling -- */

const distRel = conf.build?.frontendDist
ok(Boolean(distRel), `frontendDist is set (${distRel})`)
const dist = resolve(ROOT, 'src-tauri', distRel)
ok(dist === resolve(ROOT, 'build'), `frontendDist points at the SvelteKit build output`)
note(`frontendDist -> ${dist.replace(`${ROOT}/`, '')}`)

const beforeBuild = conf.build?.beforeBuildCommand ?? ''
ok(
  beforeBuild.includes('build:desktop'),
  `beforeBuildCommand builds the desktop variant (${beforeBuild})`,
)

/* -------------------------------------------- build output compatibility -- */

if (await exists(dist)) {
  ok(await exists(join(dist, 'index.html')), 'build output has index.html')

  // Tauri resolves `/Ashe` via `Ashe.html`; a directory would fall through.
  for (const slug of ['Ashe', 'Hwei', 'Miss_Fortune']) {
    ok(await exists(join(dist, `${slug}.html`)), `${slug} is a flat page so Tauri can resolve /${slug}`)
  }

  const html = await readFile(join(dist, 'Ashe.html'), 'utf8')
  const refs = [...html.matchAll(/(?:href|src)="([^"]*\.(?:css|js|png|svg))"/g)].map((m) => m[1])
  ok(refs.length > 0, 'champion page references assets')
  const nonRoot = refs.filter((r) => !r.startsWith('/'))
  ok(
    nonRoot.length === 0,
    `asset URLs are root-relative so they resolve on the tauri:// origin (found ${nonRoot.slice(0, 3).join(', ')})`,
  )
  const missing = []
  for (const ref of new Set(refs)) if (!(await exists(join(dist, ref)))) missing.push(ref)
  ok(missing.length === 0, `referenced assets exist (missing: ${missing.slice(0, 3).join(', ')})`)

  // Report which navigation mode the last build compiled in.
  const nodesDir = join(dist, '_app', 'immutable', 'nodes')
  let flag = null
  if (await exists(nodesDir)) {
    for (const entry of await readdir(nodesDir)) {
      if (!entry.endsWith('.js')) continue
      const body = await readFile(join(nodesDir, entry), 'utf8')
      const m = /sveltekitPreloadData\s*=\s*`?([a-z]+)`?/.exec(body)
      if (m) {
        flag = m[1]
        break
      }
    }
  }
  if (flag) {
    ok(['off', 'hover'].includes(flag), `navigation flag is a known value (${flag})`)
    note(`navigation mode in this build: ${flag} (off = desktop, hover = web)`)
  } else {
    note('navigation flag not found in the client bundle (build may predate it)')
  }
} else {
  note('no build output yet — run "npm run build:desktop"')
}

/* ------------------------------------------------------------------ done -- */

console.log(`${checks} desktop checks run.`)
for (const n of notes) console.log(`  note: ${n}`)
if (failures.length) {
  console.error(`\nFAILED — ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('All desktop checks passed.')
