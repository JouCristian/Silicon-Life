import { assembly, decode, hex, u32 } from '../core/isa'

export const MAX_PROGRAM_WORDS = 256
export interface ProgramIssue { readonly index: number; readonly word: number; readonly reason: string }
export class ProgramValidationError extends Error {
  constructor(readonly issues: readonly ProgramIssue[]) {
    super(issues.map(issue => `第 ${issue.index + 1} 条 [${hex(issue.word)}]：${issue.reason}`).join('\n'))
    this.name = 'ProgramValidationError'
  }
}

/** Host ROM policy. CPU arithmetic and decoding semantics remain in core/. */
export function validateProgram(words: readonly number[]): readonly number[] {
  if (words.length > MAX_PROGRAM_WORDS) throw new Error(`程序最多 ${MAX_PROGRAM_WORDS} 条指令`)
  const issues: ProgramIssue[] = []
  words.forEach((word, index) => {
    try {
      if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) throw new Error('必须为 32 位无符号整数')
      decode(word)
    } catch (error) { issues.push({ index, word, reason: (error as Error).message }) }
  })
  if (issues.length) throw new ProgramValidationError(issues)
  return Object.freeze([...words])
}

export function programListing(words: readonly number[]) {
  return words.map((word, index) => {
    const instruction = decode(word), address = index * 4
    const target = instruction.op === 'BEQ' ? u32(address + instruction.imm) : undefined
    return { index, address, word, instruction, assembly: assembly(instruction), target,
      targetValid: target === undefined || target % 4 === 0 && target < words.length * 4 }
  })
}

function indexIn(words: readonly number[], index: number, insertion = false) {
  if (!Number.isInteger(index) || index < 0 || index >= words.length + (insertion ? 1 : 0)) throw new Error('程序索引无效')
}
export function insertWord(words: readonly number[], index: number, word: number) {
  indexIn(words, index, true)
  return validateProgram([...words.slice(0, index), word, ...words.slice(index)])
}
export function removeWord(words: readonly number[], index: number) {
  indexIn(words, index)
  return validateProgram(words.filter((_, i) => i !== index))
}
export function moveWord(words: readonly number[], from: number, to: number) {
  indexIn(words, from); indexIn(words, to)
  const copy = [...words], [word] = copy.splice(from, 1)
  copy.splice(to, 0, word)
  return validateProgram(copy)
}
