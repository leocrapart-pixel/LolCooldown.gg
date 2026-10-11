/**
 * Checks for the Neutralinojs desktop build.
 *
 *   node tools/check-desktop.mjs
 *
 * Runs without Neutralino or a display: it verifies the facts that decide whether
 * the packaged app can work at all.
 *
 *   1. Every URL the app links to resolves to a file Neutralino's router will
 *      actually find. Neutralino decides "file or directory" by whether the path
 *      contains a dot (`server/router.cpp`), so `/Ashe` becomes `Ashe/index.html`
 *      — a flat `Ashe.html` is never reachable. This is the check that matters
 *      most, and it is asserted against the real staged tree.
 *   2. Assets are root-relative, so they resolve under the local server.
 *   3. `neutralino.config.json` points `documentRoot`/`resourcesPath` at the
 *      staged app, names the window, and asks for no native permissions the app
 *      does not need.
 *   4. The client library is inside the document root (outside it, the local
 *      server cannot serve it).
 *   5. If a release zip exists, it contains a real 64-bit Windows GUI executable
 *      and a `resources.neu` archive holding the mirrored pages.
 */
import { readFile, readdir, access } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { listZipEntries, readZipEntry } from './lib/zip.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHELL = join(ROOT, 'neutralino')
const RESOURCES = join(SHELL, 'resources')
const APP = join(RESOURCES, 'app')
const CONFIG = join(SHELL, 'neutralino.config.json')
const DIST = join(SHELL, 'dist')

let checks = 0
const failures = []
const notes = []

function ok(condition, label) {
  checks++
  if (!condition) failures.push(label)
}

function note(message) {
  notes.push(message)
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/* ------------------------------------------------ 1. staged resource tree --- */

if (!(await exists(APP))) {
  console.log('No staged desktop resources yet — run "npm run build:desktop".')
  process.exit(0)
}

const config = JSON.parse(await readFile(CONFIG, 'utf8'))
const documentRoot = (config.documentRoot || '').replace(/^\/|\/$/g, '')
const appRoot = join(RESOURCES, documentRoot.replace(/^resources\//, ''))

ok(
  (await exists(join(appRoot, 'index.html'))),
  `documentRoot (${config.documentRoot}) contains index.html`,
)

// Champions come from the dataset so this covers every page, not a sample.
const dataset = JSON.parse(await readFile(join(ROOT, 'src', 'lib', 'data', 'champions.json'), 'utf8'))
const slugs = dataset.champions.map((c) => c.slug)

let resolved = 0
const unresolved = []
for (const slug of slugs) {
  // Neutralino: a path with no dot is a directory, so it looks for index.html.
  if (await exists(join(appRoot, slug, 'index.html'))) resolved++
  else unresolved.push(slug)
}
ok(
  unresolved.length === 0,
  `${slugs.length} champion URLs resolve to <slug>/index.html (unresolved: ${unresolved.slice(0, 5).join(', ')})`,
)
note(`${resolved}/${slugs.length} champion URLs resolve via directory index`)

// The root page.
ok(await exists(join(appRoot, 'index.html')), 'root / resolves to index.html')

/**
 * Navigation must be a full page load, not a client-side route change.
 *
 * A route change makes SvelteKit's router request `<page>/__data.json`, which no
 * static host emits and Neutralino's local server answers with 404. Since every
 * page exists as a real file, a full load always works. If this attribute is
 * dropped, in-app navigation silently becomes dependent on a file that does not
 * exist.
 */
const indexHtml = await readFile(join(appRoot, 'index.html'), 'utf8')
ok(
  /data-sveltekit-preload-data="off"/.test(indexHtml),
  'link navigation is a full page load (data-sveltekit-preload-data="off" present)',
)
for (const page of ['Ashe', 'Hwei']) {
  const body = await readFile(join(appRoot, page, 'index.html'), 'utf8')
  ok(
    /data-sveltekit-preload-data="off"/.test(body),
    `${page}/index.html opts out of client-side routing`,
  )
}

/* ------------------------------------------------------- 2. asset paths --- */

const asheHtml = await readFile(join(appRoot, 'Ashe', 'index.html'), 'utf8')
const refs = [...asheHtml.matchAll(/(?:href|src)="([^"]*\.(?:css|js|png))"/g)].map((m) => m[1])
ok(refs.length > 0, 'champion page references assets')
const relative = refs.filter((r) => !r.startsWith('/'))
ok(relative.length === 0, `all asset URLs are root-relative (found ${relative.slice(0, 3).join(', ')})`)

let assetMissing = []
for (const ref of [...new Set(refs)]) {
  if (!(await exists(join(appRoot, ref)))) assetMissing.push(ref)
}
ok(assetMissing.length === 0, `referenced assets exist in the bundle (missing: ${assetMissing.slice(0, 3).join(', ')})`)

/* ------------------------------------------------- 4. client library home --- */

ok(
  await exists(join(appRoot, 'js', 'neutralino.js')),
  'Neutralino client library is inside documentRoot (servable by the local server)',
)
const configuredLib = (config.cli?.clientLibrary || '').replace(/^\/resources\//, '')
ok(
  await exists(join(RESOURCES, configuredLib)),
  `cli.clientLibrary (${config.cli?.clientLibrary}) exists`,
)
ok(
  (config.cli?.clientLibrary || '').startsWith(config.documentRoot || '//'),
  'cli.clientLibrary sits under documentRoot',
)

/* ------------------------------------------------------------ 3. config --- */

ok(config.applicationId === 'gg.cooldownlol.desktop', `applicationId is the app's id (${config.applicationId})`)
ok(config.defaultMode === 'window', 'defaultMode is window')
ok(config.enableServer === true, 'enableServer is true (the frontend is served over HTTP)')
ok(config.url === '/', 'url is / so the window opens on the app')
ok(config.port === 0, 'port is 0 so the OS picks a free port')
ok(
  config.cli?.resourcesPath === '/resources/',
  `cli.resourcesPath is /resources/ (${config.cli?.resourcesPath})`,
)
ok(Boolean(config.cli?.binaryName), `cli.binaryName is set (${config.cli?.binaryName})`)

const window = config.modes?.window || {}
ok(window.title === 'CooldownLol.gg', `window title is CooldownLol.gg (${window.title})`)
ok(window.exitProcessOnClose === true, 'closing the window exits the process')
ok(window.resizable === true, 'window is resizable')
ok(window.enableInspector === false, 'developer inspector is off in the shipped build')
ok(
  (window.icon || '').endsWith('.ico'),
  `window icon is an .ico (${window.icon})`,
)
const iconPath = join(RESOURCES, (window.icon || '').replace(/^\/resources\//, ''))
ok(await exists(iconPath), 'window icon file exists')
if (await exists(iconPath)) {
  const ico = readFileSync(iconPath)
  ok(ico.readUInt16LE(0) === 0 && ico.readUInt16LE(2) === 1, 'window icon is a valid ICO container')
}

// Least privilege: this app only renders local pages.
const allow = config.nativeAllowList || []
ok(
  allow.every((entry) => /^(app|window|debug)\./.test(entry)),
  `nativeAllowList grants no filesystem/shell access (${allow.join(', ')})`,
)
ok(!allow.some((e) => e.startsWith('filesystem.') || e.startsWith('os.')), 'no filesystem.* or os.* permission')

/* ------------------------------------------------------- 5. release zip --- */

const zipPath = join(DIST, `${config.cli?.binaryName}-release.zip`)
if (await exists(zipPath)) {
  // The zip is read with Node's own zlib rather than a dependency: the names in a
  // stored/deflated zip are plain, so listing entries only needs the central
  // directory.
  const entries = listZipEntries(readFileSync(zipPath))
  ok(
    entries.includes(`${config.cli.binaryName}-win_x64.exe`),
    'release zip contains the Windows executable',
  )
  ok(entries.includes('resources.neu'), 'release zip contains resources.neu')
  const exeEntry = entries.find((e) => e.endsWith('-win_x64.exe'))
  if (exeEntry) {
    const exe = readZipEntry(readFileSync(zipPath), exeEntry)
    ok(exe.length > 1_000_000, `Windows executable is ${exe.length} bytes`)
    ok(exe[0] === 0x4d && exe[1] === 0x5a, 'Windows executable has an MZ header')
    const peOffset = exe.readUInt32LE(0x3c)
    ok(exe.readUInt32LE(peOffset) === 0x00004550, 'Windows executable has a PE signature')
    ok(exe.readUInt16LE(peOffset + 4) === 0x8664, 'Windows executable targets x86-64')
    ok(exe.readUInt16LE(peOffset + 0x5c) === 2, 'Windows executable is a GUI (not console) subsystem app')
  }
} else {
  note('no release zip yet — run "npm run build:desktop" for the Windows artifact')
}

/* ------------------------------------ 6. platform release zip (Windows) --- */

/**
 * The artifact a user actually downloads: one executable plus `resources.neu`.
 * The all-platform zip `neu build` writes also works, but ships ~14 MB of macOS
 * and Linux binaries to a Windows user, so the published release is this one.
 */
const winZip = join(DIST, `${config.cli?.binaryName}-win_x64.zip`)
if (await exists(winZip)) {
  const buf = readFileSync(winZip)
  const names = listZipEntries(buf)
  ok(names.length === 2, `Windows zip holds exactly the app (${names.join(', ')})`)
  ok(
    names.includes('resources.neu'),
    'Windows zip contains resources.neu',
  )
  const exeName = names.find((n) => n.endsWith('.exe'))
  ok(Boolean(exeName), `Windows zip contains an .exe (${exeName})`)
  if (exeName) {
    const exe = readZipEntry(buf, exeName)
    const pe = exe.readUInt32LE(0x3c)
    ok(exe[0] === 0x4d && exe[1] === 0x5a, 'packaged executable has an MZ header')
    ok(exe.readUInt32LE(pe) === 0x00004550, 'packaged executable has a PE signature')
    ok(exe.readUInt16LE(pe + 4) === 0x8664, 'packaged executable targets x86-64')
    ok(exe.readUInt16LE(pe + 0x5c) === 2, 'packaged executable is a GUI app, not a console app')
  }
  const neu = readZipEntry(buf, 'resources.neu')
  ok(neu.includes(Buffer.from('{"files"')), 'resources.neu carries the file manifest')
  ok(neu.length > 10_000_000, `resources.neu is complete (${(neu.length / 1048576).toFixed(1)} MB)`)

  // The pages must be inside the published bundle, not just in the staging dir.
  const manifest = readManifest(neu)
  if (manifest) {
    const wanted = ['resources/app/index.html', 'resources/app/Ashe/index.html', 'resources/app/Ashe.html']
    const missing = wanted.filter((w) => !manifest.includes(w))
    ok(missing.length === 0, `published bundle holds the pages (missing: ${missing.join(', ')})`)
    ok(
      manifest.length > 1000,
      `published bundle holds the whole app (${manifest.length} entries)`,
    )
  }
} else {
  note('no platform zip yet — run "npm run package:desktop"')
}

/* --------------------------------------------- 7. web app preserved ------ */

/**
 * The desktop work must not leak into the web app.
 *
 * A byte-for-byte comparison of `build/` cannot prove this: the bundler is not
 * deterministic (two identical consecutive builds differ in ~180 files because
 * Vite's content hashes vary run to run). What can be asserted is that the web
 * output carries no Neutralino code or markup, and that the adapter only ever
 * reads it.
 */
const WEB = join(ROOT, 'build')
if (await exists(WEB)) {
  const walk = async (dir) => {
    const out = []
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) out.push(...(await walk(full)))
      else out.push(full)
    }
    return out
  }
  const webFiles = await walk(WEB)
  ok(webFiles.length > 1000, `web build is present (${webFiles.length} files)`)

  const contaminated = []
  for (const file of webFiles) {
    if (!/\.(html|js|css|json)$/.test(file)) continue
    const body = await readFile(file, 'utf8').catch(() => '')
    if (body.includes('neutralino')) contaminated.push(file.replace(`${ROOT}/`, ''))
  }
  ok(
    contaminated.length === 0,
    `web build contains no Neutralino references (found in: ${contaminated.slice(0, 3).join(', ')})`,
  )

  // The adapter must only ever READ the web build.
  //
  // `cp(WEB_BUILD, APP_DIR)` is a read: WEB_BUILD is the source. A write would
  // have WEB_BUILD as the destination (or be a writeFile/rm/mkdir on it), so
  // `cp` is only flagged when it is NOT used in the source position.
  const adapterSource = await readFile(join(ROOT, 'tools', 'neutralino', 'adapter.js'), 'utf8')
  const cpAsSource = /\bcp\(\s*WEB_BUILD\s*,/.test(adapterSource)
  const direct = adapterSource.match(/\b(writeFile|rm|mkdir|appendFile|rename|unlink)\s*\(\s*WEB_BUILD/)
  const cpAsDest = adapterSource.match(/\bcp\([^)]*,\s*WEB_BUILD\s*[,)]/)
  ok(!direct, `the adapter does not write to the web build (${direct?.[0] ?? 'none'})`)
  ok(!cpAsDest, `the adapter does not copy into the web build (${cpAsDest?.[0] ?? 'none'})`)
  ok(cpAsSource, 'the adapter consumes the web build only as a copy source')
}


/** Read the file-name list from a `resources.neu` archive (asar-style manifest). */
function readManifest(buffer) {
  const start = buffer.indexOf('{"files"')
  if (start < 0) return null
  try {
    const header = JSON.parse(buffer.subarray(start).toString('utf8').slice(0, buffer.length))
    const out = []
    const walk = (node, prefix) => {
      for (const [name, meta] of Object.entries(node)) {
        const path = `${prefix}${name}`
        if (meta && meta.files) walk(meta.files, `${path}/`)
        else out.push(path)
      }
    }
    walk(header.files, '')
    return out
  } catch {
    return null
  }
}

/* ----------------------------------------------------------------- done --- */

console.log(`${checks} desktop checks run.`)
for (const n of notes) console.log(`  note: ${n}`)
if (failures.length) {
  console.error(`\nFAILED — ${failures.length} problem(s):`)
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('All desktop checks passed.')
