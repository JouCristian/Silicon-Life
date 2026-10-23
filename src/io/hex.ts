import { MAX_ROM_WORDS, type ProgramWords } from '../core/rom'
export const MAX_HEX_BYTES = 4 * 1024 * 1024
export type CellWidth = 8 | 32
export type HexByteOrder = 'big-endian' | 'little-endian'
export interface HexImage {
  readonly format: 'logisim-v2-raw' | 'plain' | `logisim-v3-${'words' | 'bytes'}-${'plain' | 'addressed'}`
  readonly width: CellWidth
  readonly values: ProgramWords
  readonly byteOrder?: HexByteOrder
}

/** Logisim v3 addresses refer to words or bytes in the FILE, not CPU PCs.
 * Normalize to logical cells before the existing ROM/RAM loaders see them.
 * Unlike Logisim's warning-and-truncate recovery, invalid/overflowing input
 * fails atomically here. Words are complete values, so any endian tag has no
 * effect. Reference: logisim-evolution/.../gui/hex/HexFile.java. */
function parseV3(source: string, width: CellWidth, maxValues: number): HexImage {
  const lines = source.split(/\r?\n/)
  const header = /^v3\.0\s+hex\s+(words|bytes)(?:\s+(plain|addressed))?(?:\s+(big-endian|little-endian))?$/i.exec(lines.shift()!.trim())
  if (!header) throw new Error('不支持的 Logisim v3.0 头部；请使用 hex words/bytes plain/addressed')
  const unit = header[1].toLowerCase()
  const style = header[2]?.toLowerCase() ?? (lines.some(line => line.includes(':')) ? 'addressed' : 'plain')
  const byteOrder: HexByteOrder = header[3]?.toLowerCase() === 'little-endian' ? 'little-endian' : 'big-endian'
  const cells = new Uint32Array(maxValues), cellBytes = width / 8
  let extent = 0, cursor = 0, hasData = false
  const fail = (line: number, reason: string): never => { throw new Error(`HEX 第 ${line} 行：${reason}`) }
  const digitsOf = (token: string, line: number): string => {
    if (!/^(?:0x)?[\da-f]+$/i.test(token)) fail(line, `非法十六进制数据「${token.slice(0, 40)}」`)
    return token.replace(/^0x/i, '')
  }
  const write = (address: number, value: number, bytes: boolean, line: number) => {
    const limit = bytes ? maxValues * cellBytes : maxValues
    if (!Number.isSafeInteger(address) || address < 0 || address >= limit) fail(line, `地址/数据超出 ${maxValues} 个 ${width} 位单元容量`)
    const cell = bytes ? Math.floor(address / cellBytes) : address
    if (bytes) {
      const lane = byteOrder === 'little-endian' ? address % cellBytes : cellBytes - 1 - address % cellBytes
      const shift = lane * 8
      cells[cell] = ((cells[cell] & ~(255 << shift)) | value << shift) >>> 0
    } else cells[cell] = value
    extent = Math.max(extent, cell + 1)
    hasData = true
  }
  // Plain bytes form one digit stream, including across whitespace/newlines.
  let pendingNibble = ''
  for (const [index, raw] of lines.entries()) {
    const line = index + 2
    let data = raw.trim()
    if (!data) continue
    if (style === 'addressed') {
      const addressed = /^((?:0x)?[\da-f]+)(?:\s*:\s*|\s+)(.*)$/i.exec(data)
      if (!addressed) fail(line, '缺少合法的十六进制地址和数据')
      cursor = Number.parseInt(addressed![1].replace(/^0x/i, ''), 16)
      // Logisim/xxd reserves two whitespace characters for the ASCII column.
      data = addressed![2].trimStart().split(/[ \t]{2,}/, 1)[0].trim()
      if (!data) fail(line, '地址后缺少数据')
    }
    for (const token of data.split(/\s+/)) {
      const digits = digitsOf(token, line)
      if (unit === 'words') {
        if (digits.length > width / 4) fail(line, `数据超出 ${width} 位范围`)
        write(cursor++, Number.parseInt(digits, 16), false, line)
      } else {
        if (style === 'addressed' && digits.length % 2) fail(line, 'bytes addressed 的数据项必须包含完整字节（偶数个十六进制数字）')
        const stream = pendingNibble + digits
        const end = stream.length - stream.length % 2
        for (let i = 0; i < end; i += 2) write(cursor++, Number.parseInt(stream.slice(i, i + 2), 16), true, line)
        pendingNibble = stream.slice(end)
      }
    }
  }
  if (pendingNibble) throw new Error('HEX bytes 数据包含不完整字节（奇数个十六进制数字）')
  if (!hasData) throw new Error('HEX 数据不能为空')
  return Object.freeze({ format: `logisim-v3-${unit}-${style}` as HexImage['format'], width,
    values: Object.freeze(Array.from(cells.subarray(0, extent))), ...(unit === 'bytes' ? { byteOrder } : {}) })
}

/** Local-file format policy, independent of DOM and CPU execution. */
export function parseHex(text: string, width: CellWidth = 32, maxValues = MAX_ROM_WORDS): HexImage {
  if (new TextEncoder().encode(text).length > MAX_HEX_BYTES) throw new Error('HEX 文件不得超过 4 MiB')
  if (width !== 8 && width !== 32 || !Number.isInteger(maxValues) || maxValues < 1 || maxValues > 262144) throw new Error('无效的 HEX 容量或数据宽度')
  const clean = text.replace(/^\uFEFF/, '').replace(/#[^\r\n]*/g, '').trim()
  if (/^v3\./i.test(clean)) return parseV3(clean, width, maxValues)
  if (clean.startsWith(':')) throw new Error('不支持 Intel HEX')
  const logisim = /^v2\.0\s+raw(?:\s|$)/i.test(clean)
  const body = logisim ? clean.replace(/^v2\.0\s+raw\s*/i, '') : clean
  const values: number[] = []
  for (const [index, token] of body.split(/\s+/).filter(Boolean).entries()) {
    const match = /^(?:(\d+)\*)?((?:0x)?[\da-f]+)$/i.exec(token)
    const fail = (reason: string): never => { throw new Error(`第 ${index + 1} 个数据项「${token.slice(0, 40)}」（展开位置 ${values.length + 1}）：${reason}`) }
    if (!match) fail('非法十六进制数据或不支持的格式')
    const count = match![1] === undefined ? 1 : Number(match![1])
    if (match![1] !== undefined && !logisim) fail('游程编码仅支持 v2.0 raw')
    if (!Number.isSafeInteger(count) || count < 1) fail('重复次数必须是正十进制整数')
    if (count > maxValues - values.length) fail(`展开后超过 ${maxValues} 个数据单元`)
    const digits = match![2].replace(/^0x/i, '')
    const value = Number.parseInt(digits, 16)
    if (digits.length > width / 4 || value > (width === 8 ? 255 : 0xffffffff)) fail(`数据超出 ${width} 位范围`)
    for (let n = 0; n < count; n++) values.push(value)
  }
  if (!values.length) throw new Error('HEX 数据不能为空')
  return Object.freeze({ format: logisim ? 'logisim-v2-raw' : 'plain', width, values: Object.freeze(values) })
}

export function exportHex(values: ProgramWords, width: CellWidth): string {
  if (width !== 8 && width !== 32) throw new Error('无效数据宽度')
  const limit = width === 8 ? 255 : 0xffffffff
  if (values.some(n => !Number.isInteger(n) || n < 0 || n > limit)) throw new Error('导出数据超出宽度')
  return `v2.0 raw\n${values.map(n => n.toString(16).padStart(width / 4, '0')).join('\n')}\n`
}
