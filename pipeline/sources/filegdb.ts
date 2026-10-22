import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Line, XY } from '../geometry.ts'

// Minimal reader for Esri File Geodatabases (.gdb directories), enough for swisstopo's
// downloads: plain attribute fields plus 2D point, line and polygon shapes. Follows the
// reverse-engineered spec at https://github.com/rouault/dump_gdbtable/wiki/FGDB-Spec.
//
//   for (const row of readTable(gdb, 'PURE_LIN')) if (row.get('STR_ESID') === 42) row.shape()

export type Value = number | string | null
/** A shape's parts: points (one part with one point), line parts or polygon rings. */
export type Shape = { kind: 'point' | 'line' | 'polygon'; parts: Line[] }

type Field = { name: string; type: number; nullable: boolean }
type GeometryField = { xOrigin: number; yOrigin: number; xyScale: number }

/** One table row: its OBJECTID, attribute values by field name, the shape decoded on demand. */
export type Row = { id: number; get(field: string): Value; shape(): Shape | null }

class Cursor {
  readonly buf: Buffer
  at: number
  constructor(buf: Buffer, at = 0) {
    this.buf = buf
    this.at = at
  }
  u8 = () => this.buf.readUInt8(this.at++)
  i16 = () => this.move(2, this.buf.readInt16LE(this.at))
  i32 = () => this.move(4, this.buf.readInt32LE(this.at))
  u32 = () => this.move(4, this.buf.readUInt32LE(this.at))
  f32 = () => this.move(4, this.buf.readFloatLE(this.at))
  f64 = () => this.move(8, this.buf.readDoubleLE(this.at))
  i64 = () => this.move(8, Number(this.buf.readBigInt64LE(this.at)))
  bytes = (n: number) => this.move(n, this.buf.subarray(this.at, this.at + n))
  utf16 = (chars: number) => this.bytes(chars * 2).toString('utf16le')
  /** Unsigned LEB128-style integer (exact up to 2^53, plenty for coordinates). */
  varuint(): number {
    let [value, scale, b] = [0, 1, 0]
    do {
      b = this.u8()
      value += (b & 0x7f) * scale
      scale *= 128
    } while (b & 0x80)
    return value
  }
  /** Like varuint, but bit 6 of the first byte is the sign. */
  varint(): number {
    let b = this.u8()
    const negative = b & 0x40
    let [value, scale] = [b & 0x3f, 64]
    while (b & 0x80) {
      b = this.u8()
      value += (b & 0x7f) * scale
      scale *= 128
    }
    return negative ? -value : value
  }
  private move<T>(n: number, value: T): T {
    this.at += n
    return value
  }
}

/** The rows of the table called `name` (as listed in the geodatabase's catalog). */
export function* readTable(gdb: string, name: string): Generator<Row> {
  const table = [...rows(gdb, 1)].find((r) => r.get('Name') === name)
  if (!table) throw new Error(`${gdb}: no table ${name}`)
  yield* rows(gdb, table.id)
}

function* rows(gdb: string, id: number): Generator<Row> {
  const file = join(gdb, `a${id.toString(16).padStart(8, '0')}`)
  const table = new Cursor(readFileSync(`${file}.gdbtable`))
  const { fields, geometry, utf8 } = header(table)
  const nullableCount = fields.filter((f) => f.nullable).length
  for (const [id, offset] of rowOffsets(readFileSync(`${file}.gdbtablx`))) {
    const c = new Cursor(table.buf, offset + 4)
    const nulls = c.bytes(Math.ceil(nullableCount / 8))
    const values = new Map<string, Value>()
    let shapeAt: number | undefined
    let bit = 0
    for (const field of fields) {
      if (field.type === 6) continue // OBJECTID: implicit
      if (field.nullable && nulls[bit >> 3]! & (1 << (bit++ & 7))) {
        values.set(field.name, null)
        continue
      }
      if (field.type === 7) shapeAt = c.at
      values.set(field.name, value(c, field.type, utf8))
    }
    yield {
      id,
      get: (f) => {
        const v = values.get(f)
        if (v === undefined) throw new Error(`${file}: no field ${f}`)
        return v
      },
      shape: () => (shapeAt === undefined || !geometry ? null : decodeShape(new Cursor(table.buf, shapeAt), geometry)),
    }
  }
}

function header(c: Cursor) {
  c.at = 0
  if (c.i32() !== 3) throw new Error('only FileGDB tables with 32-bit OBJECTIDs are supported')
  c.at = 32
  c.at = c.i64() + 4 // field descriptions, after their size
  c.i32() // version
  const layerFlags = c.u32()
  const utf8 = Boolean(layerFlags & (1 << 8))
  const fields: Field[] = []
  let geometry: GeometryField | undefined
  for (let n = c.i16(); n > 0; n--) {
    const name = c.utf16(c.u8())
    c.utf16(c.u8()) // alias
    const type = c.u8()
    let flags = 0
    if (type === 4) {
      c.i32() // max length
      flags = c.u8()
      if (flags & 4) c.bytes(c.varuint())
    } else if (type === 7) {
      c.u8()
      flags = c.u8()
      c.bytes(c.i16()) // spatial reference WKT
      const geomFlags = c.u8()
      const [hasZ, hasM] = [geomFlags & 2, geomFlags & 4]
      geometry = { xOrigin: c.f64(), yOrigin: c.f64(), xyScale: c.f64() }
      c.bytes(8 * ((hasM ? 2 : 0) + (hasZ ? 2 : 0) + 1 + (hasM ? 1 : 0) + (hasZ ? 1 : 0))) // origins, scales, tolerances
      c.bytes(8 * 4) // extent
      // optional z and m extents: skip until the spatial index marker (0, then 1–3 grid sizes as uint32)
      const atGrids = () => c.buf[c.at] === 0 && c.buf.readUInt32LE(c.at + 1) - 1 < 3
      for (let i = 0; i < 2 && !atGrids(); i++) c.bytes(16)
      c.u8()
      c.bytes(8 * c.u32()) // spatial index grid sizes
    } else if (type === 9) {
      throw new Error(`raster field ${name} is not supported`)
    } else if (type === 6 || type === 8 || type === 10 || type === 11 || type === 12) {
      c.u8()
      flags = c.u8()
    } else {
      c.u8() // width
      flags = c.u8()
      c.bytes(c.u8()) // default value
    }
    fields.push({ name, type, nullable: Boolean(flags & 1) })
  }
  return { fields, geometry, utf8 }
}

/** [OBJECTID, offset in the .gdbtable] per row, skipping deleted rows and absent 1024-row blocks. */
function rowOffsets(tablx: Buffer): [id: number, offset: number][] {
  const c = new Cursor(tablx)
  if (c.i32() !== 3) throw new Error('only FileGDB tables with 32-bit OBJECTIDs are supported')
  const [blocks, rowCount, size] = [c.i32(), c.i32(), c.i32()]
  c.at = 16 + size * blocks * 1024
  const bitmapWords = c.i32()
  const present = (block: number) => !bitmapWords || Boolean(tablx[c.at + 12 + (block >> 3)]! & (1 << (block & 7)))
  const offsets: [number, number][] = []
  let slot = 0
  for (let block = 0; block * 1024 < rowCount; block++) {
    if (!present(block)) continue
    for (let i = 0; i < 1024 && block * 1024 + i < rowCount; i++, slot++) {
      const at = 16 + slot * size
      const offset = size === 4 ? tablx.readUInt32LE(at) : tablx.readUIntLE(at, size)
      if (offset) offsets.push([block * 1024 + i + 1, offset])
    }
  }
  return offsets
}

function value(c: Cursor, type: number, utf8: boolean): Value {
  switch (type) {
    case 0:
      return c.i16()
    case 1:
      return c.i32()
    case 2:
      return c.f32()
    case 3:
    case 5: // datetime: days since 1899-12-30
    case 14:
    case 15:
      return c.f64()
    case 13:
      return c.i64()
    case 16: {
      const days = c.f64()
      c.i16() // UTC offset
      return days
    }
    case 4:
    case 12: {
      const bytes = c.bytes(c.varuint())
      return bytes.toString(utf8 ? 'utf8' : 'utf16le')
    }
    case 7:
    case 8:
      c.bytes(c.varuint())
      return null
    case 10:
    case 11:
      return c.bytes(16).toString('hex')
    default:
      throw new Error(`unknown FileGDB field type ${type}`)
  }
}

const POINT = new Set([1, 9, 11, 21])
const LINE = new Set([3, 10, 13, 23, 50])
const POLYGON = new Set([5, 15, 19, 25, 51])

function decodeShape(c: Cursor, g: GeometryField): Shape | null {
  c.varuint() // blob length
  const type = c.varuint()
  const base = type & 0xff
  const xy = (dx: number, dy: number): XY => [dx / g.xyScale + g.xOrigin, dy / g.xyScale + g.yOrigin]
  if (POINT.has(base)) {
    const [x, y] = [c.varuint(), c.varuint()]
    return x && y ? { kind: 'point', parts: [[xy(x - 1, y - 1)]] } : null
  }
  if (!LINE.has(base) && !POLYGON.has(base)) throw new Error(`unsupported FileGDB shape type ${type}`)
  const points = c.varuint()
  if (!points) return null
  const partCount = c.varuint()
  if (type & 0x20000000) throw new Error('curved FileGDB shapes are not supported')
  for (let i = 0; i < 4; i++) c.varuint() // bbox
  const sizes = Array.from({ length: partCount - 1 }, () => c.varuint())
  sizes.push(points - sizes.reduce((a, b) => a + b, 0))
  let [dx, dy] = [0, 0]
  const parts = sizes.map((n) =>
    Array.from({ length: n }, () => {
      dx += c.varint()
      dy += c.varint()
      return xy(dx, dy)
    }),
  )
  return { kind: LINE.has(base) ? 'line' : 'polygon', parts }
}
