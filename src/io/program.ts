import { assembly, decode, hex, u32 } from '../core/isa'
import { InstructionROM, type ProgramWords } from '../core/rom'

export const MAX_PROGRAM_WORDS = 65536
export interface ProgramIssue { readonly index: number; readonly word: number; readonly reason: string }
export class ProgramValidationError extends Error {
  constructor(readonly issues: readonly ProgramIssue[]) {
    super(issues.map(issue => `第 ${issue.index + 1} 条 [${hex(issue.word)}]：${issue.reason}`).join('\n'))
    this.name = 'ProgramValidationError'
  }
}

/** Host ROM policy. CPU arithmetic and decoding semantics remain in core/. */
export function validateProgram(words: ArrayLike<number>, strict = true): InstructionROM {
  if (!Number.isInteger(words.length) || words.length < 0 || words.length > MAX_PROGRAM_WORDS) throw new Error(`程序最多 ${MAX_PROGRAM_WORDS} 条指令`)
  const issues: ProgramIssue[] = []
  for (let index = 0; index < words.length; index++) {
    const word = words[index]
    try {
      if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) throw new Error('必须为 32 位无符号整数')
      if (strict) decode(word)
    } catch (error) {
      issues.push({ index, word, reason: (error as Error).message })
      if (issues.length === 32) break // Bound error text and allocation for hostile raw programs.
    }
  }
  if (issues.length) throw new ProgramValidationError(issues)
  return words instanceof InstructionROM ? words : new InstructionROM(words)
}

export function instructionRow(words: ArrayLike<number>, index: number) {
  const word = words[index], address = index * 4
  try {
    const instruction = decode(word)
    const target = instruction.op === 'BEQ' ? u32(address + instruction.imm) : undefined
    return { index, address, word, instruction, assembly: assembly(instruction), error: '', target,
      targetValid: target === undefined || target % 4 === 0 && target < words.length * 4 }
  } catch (error) {
    return { index, address, word, instruction: undefined, assembly: '当前 CPU 不支持该指令', error: (error as Error).message, target: undefined, targetValid: true }
  }
}
export function programListing(words: ArrayLike<number>, start = 0, end = words.length) {
  return Array.from({ length: Math.max(0, Math.min(end, words.length) - start) }, (_, i) => instructionRow(words, start + i))
}

function indexIn(words: ProgramWords, index: number, insertion = false) {
  if (!Number.isInteger(index) || index < 0 || index >= words.length + (insertion ? 1 : 0)) throw new Error('程序索引无效')
}
export function insertWord(words: ProgramWords, index: number, word: number) {
  indexIn(words, index, true)
  return validateProgram([...words.slice(0, index), word, ...words.slice(index)], false)
}
export function removeWord(words: ProgramWords, index: number) {
  indexIn(words, index)
  return validateProgram(words.filter((_, i) => i !== index), false)
}
export function moveWord(words: ProgramWords, from: number, to: number) {
  indexIn(words, from); indexIn(words, to)
  const copy = [...words], [word] = copy.splice(from, 1)
  copy.splice(to, 0, word)
  return validateProgram(copy, false)
}
