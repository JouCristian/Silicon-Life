/** Compact, immutable-by-API ROM. The owned Uint32Array never escapes. */
export class InstructionROM implements Iterable<number> {
  readonly [index: number]: number
  readonly length: number
  #words: Uint32Array
  constructor(words: ArrayLike<number>) {
    if (!Number.isInteger(words.length) || words.length < 0 || words.length > 65536) throw new Error('无效 ROM 长度')
    for (let i = 0; i < words.length; i++) if (!Number.isInteger(words[i]) || words[i] < 0 || words[i] > 0xffffffff) throw new Error('ROM 机器码必须为 32 位无符号整数')
    this.#words = Uint32Array.from(words)
    this.length = this.#words.length
    Object.freeze(this)
    return new Proxy(this, {
      get: (target, key) => {
        if (key === 'constructor') return InstructionROM
        if (typeof key === 'string' && /^\d+$/.test(key)) return target.#words[Number(key)]
        const value: unknown = Reflect.get(target, key)
        return typeof value === 'function' ? value.bind(target) : value
      },
      set: () => false, defineProperty: () => false, deleteProperty: () => false,
    })
  }
  get byteLength() { return this.length * 4 }
  slice(start = 0, end = this.length): number[] { return Array.from(this.#words.slice(start, end)) }
  [Symbol.iterator]() { return this.#words.values() }
  forEach(fn: (word: number, index: number) => void) { this.#words.forEach((word, index) => fn(word, index)) }
  map<T>(fn: (word: number, index: number) => T): T[] { return Array.from(this.#words, fn) }
  some(fn: (word: number, index: number) => boolean) { return this.#words.some((word, index) => fn(word, index)) }
  every(fn: (word: number, index: number) => boolean) { return this.#words.every((word, index) => fn(word, index)) }
  filter(fn: (word: number, index: number) => boolean): number[] { return Array.from(this.#words).filter(fn) }
  toTypedArray() { return this.#words.slice() }
}
export type ProgramWords = readonly number[] | InstructionROM
