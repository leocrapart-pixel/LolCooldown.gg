/**
 * A minimal ZIP reader.
 *
 * Enough to inspect a distribution archive without adding a dependency: it walks
 * the central directory (so names and sizes are exact, and any combination of
 * stored and deflated entries works) and inflates what is asked for.
 *
 * Only read capability is needed here, and only for build verification.
 */
import { inflateRawSync } from 'node:zlib'

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50
const LOCAL_SIGNATURE = 0x04034b50

function findEndOfCentralDirectory(buffer) {
  // The EOCD record is at the end, but a trailing comment can push it back.
  const maxComment = 0xffff
  const min = Math.max(0, buffer.length - maxComment - 22)
  for (let i = buffer.length - 22; i >= min; i--) {
    if (buffer.readUInt32LE(i) === EOCD_SIGNATURE) return i
  }
  return -1
}

/** List every entry name in a ZIP buffer, in central-directory order. */
export function listZipEntries(buffer) {
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) throw new Error('not a ZIP file: no end-of-central-directory record')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const names = []
  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    names.push(buffer.toString('utf8', offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + extraLength + commentLength
  }
  return names
}

/** Extract one entry's bytes (deflate and stored are both handled). */
export function readZipEntry(buffer, wanted) {
  const eocd = findEndOfCentralDirectory(buffer)
  if (eocd < 0) throw new Error('not a ZIP file')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)

  for (let i = 0; i < count; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) break
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.toString('utf8', offset + 46, offset + 46 + nameLength)

    if (name === wanted) {
      if (buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
        throw new Error(`bad local header for ${name}`)
      }
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + localNameLength + localExtraLength
      const data = buffer.subarray(start, start + compressedSize)
      if (method === 0) return data
      if (method === 8) return inflateRawSync(data)
      throw new Error(`unsupported compression method ${method} for ${name}`)
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`entry not found in ZIP: ${wanted}`)
}
