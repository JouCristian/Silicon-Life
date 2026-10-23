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
  it.each([':020000000000FE', 'v2.0 addressed\n00', '@00 01', '2*00', 'v2.0 raw\n0*00', 'v2.0 raw\n-1*00', 'v2.0 raw\n1.5*00', 'xyz', ''])('rejects unsupported or malformed input: %s', source => {
    expect(() => parseHex(source)).toThrow()
  })
  it('rejects large bytes, long files, bombs and capacity+1 before expansion', () => {
    expect(() => parseHex('100', 8)).toThrow('8 位')
    expect(() => parseHex('100000000')).toThrow('32 位')
    expect(() => parseHex('v2.0 raw\n999999999999999999*00')).toThrow()
    expect(() => parseHex('v2.0 raw\n257*00500093', 32, 256)).toThrow('256')
    expect(() => parseHex(' '.repeat(MAX_HEX_BYTES + 1))).toThrow('4 MiB')
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

describe('Logisim-evolution v3.0 HEX', () => {
  it('reads words plain without swapping the logical word', () => {
    const image = parseHex('\uFEFF# ROM\nv3.0 hex words plain\n0x00500093 ffffffff # data\n00700113')
    expect(image.format).toBe('logisim-v3-words-plain')
    expect(image.values).toEqual([0x00500093, 0xffffffff, 0x00700113])
    expect(image.byteOrder).toBeUndefined()
    expect(Object.isFrozen(image.values)).toBe(true)
    expect(parseHex('v3.0 hex words plain\n00 ff', 8).values).toEqual([0, 255])
  })
  it('uses hex WORD addresses, zero holes, out-of-order lines and last-write-wins', () => {
    const image = parseHex('v3.0 hex words addressed\n0x000a: ffffffff\n0002 11223344 55667788\n0003 : 0000002a  ascii ignored\n0000: 00500093')
    expect(image.values).toEqual([0x00500093, 0, 0x11223344, 42, 0, 0, 0, 0, 0, 0, 0xffffffff])
    expect(parseHex('v3.0 hex words\n0001: ff', 8).values).toEqual([0, 255])
  })
  it.each(['big-endian', 'little-endian'])('keeps words unchanged even when an irrelevant %s tag is present', endian => {
    expect(parseHex(`v3.0 hex words plain ${endian}\n11223344`).values).toEqual([0x11223344])
  })
  it('reads continuous bytes across plain groups/lines; defaults to big endian', () => {
    const image = parseHex('v3.0 hex bytes plain\n0x11 22\n3344 ffffffff')
    expect(image.values).toEqual([0x11223344, 0xffffffff])
    expect(image.byteOrder).toBe('big-endian')
    expect(parseHex('v3.0 hex bytes plain\n1 1 223344').values).toEqual([0x11223344])
    expect(parseHex('v3.0 hex bytes\n11223344').values).toEqual([0x11223344])
  })
  it.each(['plain', 'addressed'])('converts %s bytes with explicit byte order', style => {
    const body = style === 'plain' ? '44332211 2a000000' : '0004: 2a000000\n0000: 44332211'
    expect(parseHex(`v3.0 hex bytes ${style} little-endian\n${body}`).values).toEqual([0x11223344, 42])
    expect(parseHex(`v3.0 hex bytes ${style} big-endian\n${body}`).values).toEqual([0x44332211, 0x2a000000])
  })
  it('uses BYTE addresses, handles unaligned fragments and overwrites just the addressed lanes', () => {
    const data = '0003: 44 55\n0000: 11 22\n0001: ff'
    expect(parseHex(`v3.0 hex bytes addressed\n${data}`).values).toEqual([0x11ff0044, 0x55000000])
    expect(parseHex(`v3.0 hex bytes addressed little-endian\n${data}`).values).toEqual([0x4400ff11, 0x55])
    const xxd = '00000000: 1122 3344  ....\n00000008: ff  . # comment'
    expect(parseHex(`v3.0 hex bytes addressed\n${xxd}`).values).toEqual([0x11223344, 0, 0xff000000])
  })
  it('pads a partial cell with zeros, preserving complete bytes, and ignores byte order for 8-bit cells', () => {
    expect(parseHex('v3.0 hex bytes plain\n1122').values).toEqual([0x11220000])
    expect(parseHex('v3.0 hex bytes plain little-endian\n1122').values).toEqual([0x2211])
    for (const endian of ['big-endian', 'little-endian']) {
      expect(parseHex(`v3.0 hex bytes addressed ${endian}\n0002: 11ff`, 8).values).toEqual([0, 0, 17, 255])
    }
  })
  it('checks the highest addressed extent, including holes, before writing', () => {
    expect(parseHex('v3.0 hex words addressed\n000f: ffffffff', 32, 16).values).toHaveLength(16)
    expect(parseHex('v3.0 hex bytes addressed\n003f: ff', 32, 16).values[15]).toBe(255)
    for (const source of ['v3.0 hex words addressed\n0010: 1', 'v3.0 hex bytes addressed\n0040: 00', 'v3.0 hex bytes addressed\n003f: ff00', 'v3.0 hex words addressed\nffffffffffffffff: 1']) {
      expect(() => parseHex(source, 32, 16)).toThrow('容量')
    }
  })
  it.each([
    'v3.1 hex words plain\n00', 'v3.0 hex bananas plain\n00',
    'v3.0 hex bytes plain middle-endian\n00',
    'v3.0 hex words addressed\n-1: ff', 'v3.0 hex words addressed\n0000:',
    'v3.0 hex words addressed\n00500093', 'v3.0 hex bytes plain\n123',
    'v3.0 hex bytes addressed\n0000: 1', 'v3.0 hex bytes plain\n11zz',
    'v3.0 hex words plain\n2*ff', 'v3.0 hex words plain\n100000000', 'v3.0 hex words plain\n# empty',
  ])('rejects malformed data atomically instead of silently truncating: %s', source => {
    expect(() => parseHex(source)).toThrow()
  })
  it('rejects words outside the selected RAM width', () => {
    expect(() => parseHex('v3.0 hex words plain\n100', 8)).toThrow('8 位')
  })
  it('supports the entire 256KiB byte RAM and its final addressed byte', () => {
    const image = parseHex('v3.0 hex bytes addressed little-endian\n3ffff: a5', 8, 262144)
    const memory = memoryImage(image, 0, 262144)
    expect(memory.length).toBe(262144)
    expect(memory[262143]).toBe(0xa5)
    expect(memory[0]).toBe(0)
    expect(() => parseHex('v3.0 hex bytes addressed\n40000: 00', 8, 262144)).toThrow('容量')
  })
  it('maps file addresses relative to the existing RAM offset and enforces capacity/alignment', () => {
    const image = parseHex('v3.0 hex bytes addressed little-endian\n0003: 11\n0004: 44332211')
    const memory = memoryImage(image, 64)
    expect(memory.slice(64, 72)).toEqual([0, 0, 0, 17, 0x44, 0x33, 0x22, 0x11])
    expect(readWord(memory, 68)).toBe(0x11223344)
    expect(() => memoryImage(image, 1020)).toThrow('边界')
    expect(() => memoryImage(image, 65)).toThrow('对齐')
    expect(memoryImage(parseHex('v3.0 hex bytes addressed\n1: ff', 8), 65)[66]).toBe(255)
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
