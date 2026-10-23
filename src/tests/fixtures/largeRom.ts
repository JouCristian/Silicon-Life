/** Synthetic addressed data at the reported sample sizes. These are not the
 * user's original HEX files; distinct values detect dropped/shifted words. */
export function addressedRomFixture(count: number) {
  const words = Uint32Array.from({ length: count }, (_, i) => Math.imul(i + 1, 0x9e3779b1) >>> 0)
  words[0] = 0x00500093
  words[count - 1] = 0x00700113
  const lines = ['v3.0 hex words addressed']
  for (let i = 0; i < count; i += 8) {
    lines.push(`${i.toString(16)}: ${Array.from(words.subarray(i, i + 8), n => n.toString(16).padStart(8, '0')).join(' ')}`)
  }
  return { words, text: lines.join('\n') }
}
