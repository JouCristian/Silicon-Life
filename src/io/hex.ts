import type { ProgramWords } from '../core/rom'
export const MAX_HEX_BYTES = 4 * 1024 * 1024
export type CellWidth = 8 | 32
export interface HexImage {
  readonly format: 'logisim-v2-raw' | 'plain'
  readonly width: CellWidth
  readonly values: ProgramWords
}

/** Local-file format policy, independent of DOM and CPU execution. */
export function parseHex(text: string, width: CellWidth = 32, maxValues = 65536): HexImage {
  if (new TextEncoder().encode(text).length > MAX_HEX_BYTES) throw new Error('HEX 文件不得超过 4 MiB')
  if (width !== 8 && width !== 32 || !Number.isInteger(maxValues) || maxValues < 1 || maxValues > 262144) throw new Error('无效的 HEX 容量或数据宽度')
  const clean = text.replace(/^\uFEFF/, '').replace(/#[^\r\n]*/g, '').trim()
  if (/^v3\./i.test(clean)) throw new Error('不支持 Logisim v3.0，请导出 v2.0 raw')
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
