import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { parseHex } from '../io/hex'
import { memoryImage } from '../io/memoryImage'
import type { ParsedFile } from '../io/workerClient'
import { MAX_ROM_WORDS } from '../core/rom'
import { addressedRomFixture } from './fixtures/largeRom'

// Exercise the real worker entrypoint and transferable payload, without a
// browser or an imitation parser. Only the Worker transport is stubbed.
const transport = { onmessage: undefined as unknown as (event: MessageEvent) => void, postMessage: vi.fn() }
beforeAll(async () => { vi.stubGlobal('self', transport); await import('../io/parse.worker') })
afterAll(() => vi.unstubAllGlobals())

describe('HEX Worker protocol', () => {
  it.each([
    ['v3.0 hex words plain\n00500093 00700113 002081b3', 32, 65536],
    ['v3.0 hex bytes plain little-endian\n9300500013017000b3812000', 32, 65536],
    ['v3.0 hex bytes addressed big-endian\n3ffff: ff', 8, 262144],
    ['v2.0 raw\n2*ff', 8, 1024],
  ] as const)('preserves parsed cells, width and endian metadata: %s', (text, width, maxValues) => {
    transport.postMessage.mockClear()
    transport.onmessage({ data: { text, width, maxValues, kind: 'hex' } } as MessageEvent)
    const [result, options] = transport.postMessage.mock.calls[0] as [ParsedFile, { transfer: ArrayBuffer[] }]
    const direct = parseHex(text, width, maxValues)
    expect(Array.from(result.values!)).toEqual(Array.from(direct.values))
    expect(result).toMatchObject({ format: direct.format, width })
    expect(result.byteOrder).toBe(direct.byteOrder)
    expect(options.transfer).toEqual([result.values!.buffer])
    if (width === 8) {
      // RAM keeps all byte cells; it must not pass through the 65536-word ROM container.
      expect(memoryImage({ ...direct, values: Object.freeze(Array.from(result.values!)) }, 0, maxValues).length).toBe(maxValues)
    }
  })
  it('returns only an error for overflowing data, never a partial image', () => {
    transport.postMessage.mockClear()
    transport.onmessage({ data: { text: 'v3.0 hex bytes addressed\n0400: ff', width: 8, maxValues: 1024, kind: 'hex' } } as MessageEvent)
    expect(transport.postMessage.mock.calls[0][0]).toEqual({ error: expect.stringContaining('容量') })
    expect(transport.postMessage.mock.calls[0]).toHaveLength(1)
  })
  it.each([75184, 142272])('transfers all %i addressed ROM words without truncation', count => {
    const fixture = addressedRomFixture(count)
    transport.postMessage.mockClear()
    transport.onmessage({ data: { text: fixture.text, width: 32, maxValues: MAX_ROM_WORDS, kind: 'hex' } } as MessageEvent)
    const result = transport.postMessage.mock.calls[0][0] as ParsedFile
    expect(result.error).toBeUndefined()
    expect(result.values).toEqual(fixture.words)
  })
})
