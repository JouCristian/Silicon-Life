import { describe, expect, it } from 'vitest'
import { exportHex, MAX_HEX_BYTES, parseHex } from '../io/hex'
import { editMemory, memoryCells, memoryImage, parseValue } from '../io/memoryImage'
import { createMemory, readWord } from '../core/memory'
import { validateProgram } from '../io/program'

describe('bounded HEX file policy', () => {
  it('reads BOM, header, comments, decimal RLE and unsigned words', () => {
    expect(parseHex('\uFEFF# ROM\nv2.0 raw\n2*fff00093 # negative immediate\n00500093').values).toEqual([0xfff00093, 0xfff00093, 0x00500093])
  })
  it('reads plain multiline words and optional 0x prefix', () => {
    expect(parseHex('00500093\n0x00700113\t002081b3').values).toEqual([0x00500093, 0x00700113, 0x002081b3])
  })
  it.each(['v3.0 hex words plain\n00', ':020000000000FE', 'v2.0 addressed\n00', '@00 01', '2*00', 'v2.0 raw\n0*00', 'v2.0 raw\n-1*00', 'v2.0 raw\n1.5*00', 'xyz', ''])('rejects unsupported or malformed input: %s', source => {
    expect(() => parseHex(source)).toThrow()
  })
  it('rejects large bytes, long files, bombs and capacity+1 before expansion', () => {
    expect(() => parseHex('100', 8)).toThrow('8 位')
    expect(() => parseHex('100000000')).toThrow('32 位')
    expect(() => parseHex('v2.0 raw\n999999999999999999*00')).toThrow()
    expect(() => parseHex('v2.0 raw\n257*00500093')).toThrow('256')
    expect(() => parseHex(' '.repeat(MAX_HEX_BYTES + 1))).toThrow('64 KiB')
    expect(parseHex('v2.0 raw\n256*00500093').values).toHaveLength(256)
  })
  it('reports exact unsupported ROM index, word and reason', () => {
    expect(() => validateProgram(parseHex('00500093 ffffffff').values)).toThrow(/第 2 条 \[0xffffffff\].*不支持/)
  })
  it('round-trips canonical 32-bit ROM', () => {
    const words = [0xfff00093, 0x00500093, 0x002081b3]
    expect(parseHex(exportHex(words, 32)).values).toEqual(words)
  })
})

describe('initial RAM image policy', () => {
  it('maps 32-bit cells little endian and zeros unspecified bytes', () => {
    const memory = memoryImage(parseHex('11223344 0000002a'), 64)
    expect(memory.slice(64, 72)).toEqual([0x44, 0x33, 0x22, 0x11, 42, 0, 0, 0])
    expect(memory.slice(0, 64).every(n => n === 0)).toBe(true)
    expect(memory.slice(72).every(n => n === 0)).toBe(true)
  })
  it('maps bytes without imposing word alignment', () => {
    const memory = memoryImage(parseHex('2a 00 ff', 8, 1024), 65)
    expect(memory.slice(64, 69)).toEqual([0, 42, 0, 255, 0])
  })
  it('accepts the last byte/word and rejects overflow and unaligned word offsets', () => {
    expect(memoryImage(parseHex('ff', 8), 1023)[1023]).toBe(255)
    expect(readWord(memoryImage(parseHex('ffffffff'), 1020), 1020)).toBe(0xffffffff)
    for (const offset of [-1, 1.5, 1021, 64 + 1]) expect(() => memoryImage(parseHex('2a'), offset)).toThrow()
    expect(() => memoryImage(parseHex('ff ff', 8), 1023)).toThrow('边界')
  })
  it('manual edits are immutable, strict and match word endianness', () => {
    const before = createMemory(), after = editMemory(before, 64, '0x11223344', 32)
    expect(after.slice(64, 68)).toEqual([0x44, 0x33, 0x22, 0x11])
    expect(readWord(before, 64)).toBe(0)
    expect(editMemory(after, 65, '255', 8)[65]).toBe(255)
    expect(() => editMemory(before, 65, '1', 32)).toThrow('对齐')
    expect(() => editMemory(before, 1024, '1', 8)).toThrow('边界')
  })
  it.each(['', 'NaN', 'Infinity', '1.5', '1e2', '0b10', '4294967296', '-2147483649', '0x100000000'])('rejects invalid 32-bit manual value %s', value => {
    expect(() => parseValue(value, 32)).toThrow()
  })
  it('normalizes signed words while bytes remain unsigned', () => {
    expect(parseValue('-1', 32)).toBe(0xffffffff)
    expect(parseValue('-2147483648', 32)).toBe(0x80000000)
    expect(() => parseValue('-1', 8)).toThrow()
    expect(() => parseValue('256', 8)).toThrow()
  })
  it.each([8, 32] as const)('round-trips the entire initial RAM at %i bits', width => {
    const memory = editMemory(editMemory(createMemory(), 64, '42', 32), 1020, '-1', 32)
    const file = exportHex(memoryCells(memory, width), width)
    expect(memoryImage(parseHex(file, width, width === 8 ? 1024 : 256))).toEqual(memory)
  })
})
