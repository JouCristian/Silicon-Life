export const PAGE_BYTES = 1024
const OWNED = Symbol('owned pages')

/** Persistent page table: a write copies one 1KiB page, never the whole RAM. */
export class PagedMemory implements Iterable<number> {
  readonly [index: number]: number
  readonly length: number
  #pages: readonly Uint8Array[]
  readonly copiedPageBytes: number
  constructor(bytes: ArrayLike<number>, pages?: readonly Uint8Array[], ownership?: symbol, copiedBytes?: number) {
    if (pages && ownership !== OWNED) throw new Error('Invalid page ownership')
    if (!Number.isInteger(bytes.length) || bytes.length < 4 || bytes.length > 262144 || bytes.length % 4) throw new Error('无效 RAM 长度')
    if (!pages) for (let i = 0; i < bytes.length; i++) if (!Number.isInteger(bytes[i]) || bytes[i] < 0 || bytes[i] > 255) throw new Error('RAM 包含非法字节')
    this.length = bytes.length
    this.copiedPageBytes = copiedBytes ?? bytes.length
    this.#pages = pages ?? Array.from({ length: Math.ceil(bytes.length / PAGE_BYTES) }, (_, page) => {
      const data = new Uint8Array(Math.min(PAGE_BYTES, bytes.length - page * PAGE_BYTES))
      for (let i = 0; i < data.length; i++) data[i] = bytes[page * PAGE_BYTES + i]
      return data
    })
    Object.freeze(this)
    return new Proxy(this, {
      get: (target, key) => {
        if (key === 'constructor') return PagedMemory
        if (typeof key === 'string' && /^\d+$/.test(key)) return target.byte(Number(key))
        const value: unknown = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
      set: () => false, defineProperty: () => false, deleteProperty: () => false,
    })
  }
  byte(index: number): number { return this.#pages[Math.floor(index / PAGE_BYTES)]?.[index % PAGE_BYTES] }
  slice(start = 0, end = this.length): number[] {
    const a = Math.max(0, start < 0 ? this.length + start : Math.min(start, this.length))
    const b = Math.max(a, Math.min(end < 0 ? this.length + end : end, this.length))
    return Array.from({ length: b - a }, (_, i) => this.byte(a + i))
  }
  *[Symbol.iterator]() { for (const page of this.#pages) yield* page }
  some(fn: (byte: number, index: number) => boolean) { let i = 0; for (const n of this) if (fn(n, i++)) return true; return false }
  every(fn: (byte: number, index: number) => boolean) { return !this.some((n, i) => !fn(n, i)) }
  map<T>(fn: (byte: number, index: number) => T): T[] { return Array.from(this, fn) }
  withBytes(address: number, bytes: readonly number[]): PagedMemory {
    if (!Number.isInteger(address) || address < 0 || address + bytes.length > this.length || bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) throw new Error('无效的内存页写入')
    const pages = [...this.#pages], copied = new Set<number>()
    bytes.forEach((byte, lane) => {
      const at = address + lane, page = Math.floor(at / PAGE_BYTES)
      if (!copied.has(page)) { pages[page] = pages[page].slice(); copied.add(page) }
      pages[page][at % PAGE_BYTES] = byte
    })
    const result = new PagedMemory({ length: this.length }, pages, OWNED, copied.size * PAGE_BYTES)
    // Page ownership stays internal; diagnostics never expose mutable buffers.
    return result
  }
  toTypedArray(): Uint8Array { return Uint8Array.from(this) }
}
