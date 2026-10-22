import {
  closeSync,
  createReadStream,
  createWriteStream,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
} from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createInflateRaw } from 'node:zlib'

/** Downloads are kept here between runs (gitignored). */
export const CACHE = join(import.meta.dirname, 'cache')

/** Downloads a zip once and extracts it into the cache; returns the path without `.zip`. */
export async function cachedZip(url: string): Promise<string> {
  const zip = join(CACHE, url.slice(url.lastIndexOf('/') + 1))
  const target = zip.replace(/\.zip$/, '')
  if (existsSync(target)) return target
  mkdirSync(CACHE, { recursive: true })
  console.log(`downloading ${url} …`)
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`)
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zip))
  await unzip(zip, CACHE)
  rmSync(zip)
  return target
}

/** Extracts a zip (stored or deflated entries, no zip64) into `dir`. */
export async function unzip(zip: string, dir: string): Promise<void> {
  const fd = openSync(zip, 'r')
  try {
    const read = (at: number, n: number) => {
      const buf = Buffer.alloc(n)
      readSync(fd, buf, 0, n, at)
      return buf
    }
    const size = fstatSync(fd).size
    const tail = read(Math.max(0, size - 65_557), Math.min(size, 65_557))
    const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    if (eocd < 0) throw new Error(`${zip}: not a zip file`)
    const [count, cdSize, cdAt] = [
      tail.readUInt16LE(eocd + 10),
      tail.readUInt32LE(eocd + 12),
      tail.readUInt32LE(eocd + 16),
    ]
    if (count === 0xffff || cdAt === 0xffffffff) throw new Error(`${zip}: zip64 is not supported`)
    const cd = read(cdAt, cdSize)
    for (let i = 0, at = 0; i < count; i++) {
      const [method, compressed, nameLen, extraLen, commentLen, localAt] = [
        cd.readUInt16LE(at + 10),
        cd.readUInt32LE(at + 20),
        cd.readUInt16LE(at + 28),
        cd.readUInt16LE(at + 30),
        cd.readUInt16LE(at + 32),
        cd.readUInt32LE(at + 42),
      ]
      // swisstopo's GDB archive uses backslashes as separators
      const name = cd.toString('utf8', at + 46, at + 46 + nameLen).replaceAll('\\', '/')
      at += 46 + nameLen + extraLen + commentLen
      const out = join(dir, name)
      if (!out.startsWith(dir)) throw new Error(`${zip}: unsafe path ${name}`)
      if (name.endsWith('/')) {
        mkdirSync(out, { recursive: true })
        continue
      }
      mkdirSync(dirname(out), { recursive: true })
      const local = read(localAt, 30)
      const dataAt = localAt + 30 + local.readUInt16LE(26) + local.readUInt16LE(28)
      if (method === 0) await writeFile(out, read(dataAt, compressed))
      else if (method === 8)
        await pipeline(
          createReadStream(zip, { start: dataAt, end: dataAt + compressed - 1 }),
          createInflateRaw(),
          createWriteStream(out),
        )
      else throw new Error(`${zip}: compression method ${method} is not supported`)
    }
  } finally {
    closeSync(fd)
  }
}
