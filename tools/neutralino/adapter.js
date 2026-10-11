/**
 * A SvelteKit adapter for Neutralinojs.
 *
 *   node tools/neutralino/build.js
 *
 * ## Why this exists
 *
 * Neutralino serves the frontend from its own local HTTP server and resolves a
 * request by looking for a file, deciding "file or directory?" from whether the
 * path contains a dot. From `server/router.cpp`:
 *
 *     vector<string> split = helpers::split(path, '.');
 *     if (split.size() < 2) {                       // no dot -> a directory
 *         if (path.back() != '/') path += "/";
 *         return getAsset(path + "index.html", ...);
 *     }
 *
 * So `/Ashe` resolves to `Ashe/index.html`. It will never find a flat
 * `Ashe.html`, which is exactly how the web build lays its prerendered pages out.
 * That single fact is the whole reason a Neutralino build cannot simply reuse
 * `build/`.
 *
 * ## What it does
 *
 *  - copies the web build into `neutralino/resources/app/`
 *  - mirrors every flat page (`X.html`) to `X/index.html` so Neutralino's
 *    directory resolution finds it, while leaving the copy of `X.html` in place
 *    for hosts that do the opposite
 *  - adds a `<base>`-free, unhashed copy of `404.html` at the root as the
 *    fallback for unknown paths
 *  - ships the assets Neutralino does not provide itself: the client library
 *    (`resources/js/neutralino.js`) and the app icon
 *  - writes `neutralino.config.json`
 *
 * The web build is left untouched: nothing here reads or writes `build/`.
 */
import { readdir, readFile, writeFile, mkdir, rm, cp, access } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const ROOT = join(HERE, '..', '..')

export const WEB_BUILD = join(ROOT, 'build')
export const SHELL = join(ROOT, 'neutralino')
export const RESOURCES = join(SHELL, 'resources')
export const APP_DIR = join(RESOURCES, 'app')

/** Pages that must NOT be mirrored into a directory (they are already roots). */
const NO_MIRROR = new Set(['index.html', '404.html'])

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Mirror flat prerendered pages into directory form.
 *
 * `Ashe.html` -> `Ashe/index.html`. The original file is kept: both shapes then
 * resolve, so the same output works on Neutralino (directory-first) and on a
 * host that prefers `X.html`.
 */
async function mirrorPages(dir) {
  const mirrored = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      mirrored.push(...(await mirrorPages(full)))
      continue
    }
    if (!entry.name.endsWith('.html')) continue
    if (NO_MIRROR.has(entry.name)) continue
    const stem = basename(entry.name, '.html')
    const target = join(dir, stem, 'index.html')
    await mkdir(dirname(target), { recursive: true })
    await cp(full, target)
    mirrored.push(`${stem}/index.html`)
  }
  return mirrored
}

/** The Neutralino client library, exposed to the page as a global script. */
async function writeClientLibrary() {
  const src = join(ROOT, 'node_modules', '@neutralinojs', 'lib', 'dist', 'neutralino.js')
  if (!existsSync(src)) {
    throw new Error(
      `Neutralino client library not found at ${src}. Run "npm install" (it is a devDependency).`,
    )
  }
  // Written inside the document root: only `documentRoot` is mapped to `/` by
  // Neutralino's server, so a library outside it could never be fetched.
  const dest = join(APP_DIR, 'js', 'neutralino.js')
  await mkdir(dirname(dest), { recursive: true })
  await cp(src, dest)

  const dts = join(ROOT, 'node_modules', '@neutralinojs', 'lib', 'dist', 'neutralino.d.ts')
  if (existsSync(dts)) await cp(dts, join(APP_DIR, 'js', 'neutralino.d.ts'))

  return dest
}

/** Collect every champion slug so the window can open on a real page. */
async function writeConfig({ version, appName, binaryName }) {
  const config = {
    $schema: 'https://raw.githubusercontent.com/neutralinojs/neutralinojs/main/schemas/neutralino.config.schema.json',
    applicationId: 'gg.cooldownlol.desktop',
    version,
    defaultMode: 'window',
    // Let the OS choose a free port: two windows of the app must not collide.
    port: 0,
    documentRoot: '/resources/app/',
    url: '/',
    enableServer: true,
    enableNativeAPI: true,
    tokenSecurity: 'one-time',
    logging: { enabled: true, writeToLogFile: false },
    // The app is a pure viewer: it needs no filesystem, shell or OS access.
    nativeAllowList: ['app.*', 'window.*', 'debug.log'],
    modes: {
      window: {
        title: appName,
        width: 1280,
        height: 860,
        minWidth: 720,
        minHeight: 520,
        center: true,
        resizable: true,
        // Resource-relative: `neu` bundles this into resources.neu, so it is
        // read from the resources directory, not from the project root.
        icon: '/resources/appIcon.ico',
        exitProcessOnClose: true,
        // No devtools in a shipped build; `neu run --window-enable-inspector` overrides.
        enableInspector: false,
      },
      browser: {
        nativeBlockList: ['filesystem.*', 'os.*'],
      },
    },
    cli: {
      binaryName,
      resourcesPath: '/resources/',
      extensionsPath: '/extensions/',
      clientLibrary: '/resources/app/js/neutralino.js',
      binaryVersion: null,
      clientVersion: null,
      // No `frontendLibrary` block on purpose.
      //
      // Declaring one makes `neu build` shell out to `devCommand`/`buildCommand`
      // itself, which would run this project's build a second time (and, since
      // this adapter is what stages the resources, recursively). The frontend is
      // built by `npm run build:desktop` before `neu build` is invoked, and for
      // development `npm run dev` serves the app with HMR on its own.
    },
  }
  const dest = join(SHELL, 'neutralino.config.json')
  await writeFile(dest, `${JSON.stringify(config, null, 2)}\n`)
  return dest
}

async function packageJsonVersion() {
  const pkg = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'))
  return { version: pkg.version || '1.0.0', appName: 'CooldownLol.gg', binaryName: 'cooldownlol' }
}

/**
 * Build the Neutralino resource tree from an existing web build.
 * Returns a summary of what was produced.
 */
export async function buildNeutralinoResources({ log = console.log } = {}) {
  if (!existsSync(WEB_BUILD)) {
    throw new Error(`No web build at ${WEB_BUILD}. Run "npm run build:web" first.`)
  }

  // Start clean so a renamed champion cannot leave a stale page behind.
  await rm(APP_DIR, { recursive: true, force: true })
  await mkdir(APP_DIR, { recursive: true })
  await cp(WEB_BUILD, APP_DIR, { recursive: true })

  const mirrored = await mirrorPages(APP_DIR)
  const clientLibrary = await writeClientLibrary()
  const { version, appName, binaryName } = await packageJsonVersion()
  const config = await writeConfig({ version, appName, binaryName })

  const counts = {
    pages: (await readdir(APP_DIR, { withFileTypes: true })).filter(
      (e) => e.isFile() && e.name.endsWith('.html'),
    ).length,
    mirrored: mirrored.length,
  }

  log(`neutralino: copied web build -> ${APP_DIR}`)
  log(`neutralino: mirrored ${counts.mirrored} pages into directory form (Ashe/index.html)`)
  log(`neutralino: client library -> ${clientLibrary}`)
  log(`neutralino: config -> ${config}`)

  return { appDir: APP_DIR, config, mirrored, clientLibrary }
}

// Allow running directly: node tools/neutralino/build.js
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildNeutralinoResources().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
