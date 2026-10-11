/**
 * Package a platform-specific desktop release.
 *
 *   node tools/neutralino/package.js [platform ...]
 *
 * Default: `win_x64`.
 *
 * `neu build` bundles every platform's runtime into one zip, which is fine for a
 * "download everything" bundle but wasteful for a release: a Windows user gets
 * ~14 MB of macOS and Linux binaries they cannot use. This repackages the
 * existing build into one small zip per platform, containing only that
 * platform's executable plus `resources.neu` (the whole app, offline).
 *
 * It does not recompile anything: it reuses whatever `neu build --release` left
 * in `neutralino/dist/`, so the bytes are the same ones that were verified.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateRawSync } from 'node:zlib'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const SHELL = join(ROOT, 'neutralino')
const DIST = join(SHELL, 'dist')

/** Only the executable for the target platform plus the resource bundle. */
const PLATFORMS = {
  win_x64: { suffix: 'win_x64.exe', label: 'Windows (x64)', ext: 'exe' },
  linux_x64: { suffix: 'linux_x64', label: 'Linux (x64)', ext: 'bin' },
  mac_arm64: { suffix: 'mac_arm64', label: 'macOS (Apple silicon)', ext: 'bin' },
}

/* ------------------------------------------------------------ zip writer -- */

function crc32(buffer) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[i] = c
    }
  }
  let crc = -1
  for (let i = 0; i < buffer.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

/** Build a ZIP from `{ name, data }` entries (deflate, no data descriptors). */
function makeZip(entries) {
  const chunks = []
  const central = []
  let offset = 0

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8')
    const compressed = deflateRawSync(data, { level: 9 })
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0, 6) // flags
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(0, 10) // time
    local.writeUInt16LE(0x21, 12) // date (1980-01-01)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)

    chunks.push(local, nameBuf, compressed)
    central.push({ nameBuf, crc, compressedSize: compressed.length, size: data.length, offset })
    offset += local.length + nameBuf.length + compressed.length
  }

  const centralStart = offset
  for (const e of central) {
    const rec = Buffer.alloc(46)
    rec.writeUInt32LE(0x02014b50, 0)
    rec.writeUInt16LE(20, 4) // version made by
    rec.writeUInt16LE(20, 6) // version needed
    rec.writeUInt16LE(0, 8)
    rec.writeUInt16LE(8, 10)
    rec.writeUInt16LE(0, 12)
    rec.writeUInt16LE(0x21, 14)
    rec.writeUInt32LE(e.crc, 16)
    rec.writeUInt32LE(e.compressedSize, 20)
    rec.writeUInt32LE(e.size, 24)
    rec.writeUInt16LE(e.nameBuf.length, 28)
    rec.writeUInt32LE(e.offset, 42)
    chunks.push(rec, e.nameBuf)
    offset += rec.length + e.nameBuf.length
  }

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length, 8)
  end.writeUInt16LE(central.length, 10)
  end.writeUInt32LE(offset - centralStart, 12)
  end.writeUInt32LE(centralStart, 16)
  chunks.push(end)

  return Buffer.concat(chunks)
}

/* ---------------------------------------------------------------- driver -- */

export async function packagePlatforms(platforms = ['win_x64'], { log = console.log } = {}) {
  if (!existsSync(DIST)) {
    throw new Error(`No build in ${DIST}. Run "npm run build:desktop" first.`)
  }

  // Package from whatever `neu build --release` produced, named by binaryName.
  const entries = await readdir(DIST, { withFileTypes: true })
  const dir = entries.find((e) => e.isDirectory() && e.name !== 'node_modules')
  if (!dir) throw new Error(`No packaged app directory found in ${DIST}`)
  const appDir = join(DIST, dir.name)

  const binaryName = dir.name
  const resourcesPath = join(appDir, 'resources.neu')
  if (!existsSync(resourcesPath)) {
    throw new Error(`Missing ${resourcesPath}. Run "npm run build:desktop" first.`)
  }
  const resources = await readFile(resourcesPath)

  const produced = []
  for (const platform of platforms) {
    const spec = PLATFORMS[platform]
    if (!spec) throw new Error(`Unknown platform "${platform}". Known: ${Object.keys(PLATFORMS).join(', ')}`)

    const exePath = join(appDir, `${binaryName}-${spec.suffix}`)
    if (!existsSync(exePath)) throw new Error(`Missing executable ${exePath}`)

    const exe = await readFile(exePath)
    // Keep the original executable name so Windows associations and any
    // shortcuts a user already made keep working.
    const exeName = `${binaryName}.${spec.ext}`
    const zip = makeZip([
      { name: exeName, data: exe },
      { name: 'resources.neu', data: resources },
    ])

    const out = join(DIST, `${binaryName}-${platform}.zip`)
    await writeFile(out, zip)
    produced.push({ platform, label: spec.label, file: out, bytes: zip.length, exe: exeName })
    log(`packaged ${spec.label}: ${out} (${(zip.length / 1048576).toFixed(1)} MB)`)
  }
  return produced
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const platforms = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  packagePlatforms(platforms.length ? platforms : ['win_x64']).catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
