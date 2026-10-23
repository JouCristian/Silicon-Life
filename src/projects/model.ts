import { initialState } from '../core/cpu'
import { createMemory, MAX_MEMORY_BYTES, type DataMemory } from '../core/memory'
import { InstructionROM, MAX_ROM_WORDS } from '../core/rom'
import { validateProgram } from '../io/program'

export const PROJECT_SCHEMA = 1
export const MAX_PROJECTS = 10
export const RAM_SIZES = [1024, 65536, 262144, MAX_MEMORY_BYTES] as const
export interface Project {
  readonly schemaVersion: 1
  readonly id: string
  readonly name: string
  readonly createdAt: number
  readonly updatedAt: number
  readonly instructionROM: InstructionROM
  readonly initialRAM: DataMemory
  readonly initialRegisters: readonly number[]
  readonly ramSize: number
}
export interface ProjectRecord {
  schemaVersion: 1; id: string; name: string; createdAt: number; updatedAt: number
  instructionROM: Uint32Array; initialRAM: Uint8Array; initialRegisters: Uint32Array; ramSize: number
}
export function projectName(name: string): string {
  const checked = name.trim()
  if (!checked || checked.length > 64) throw new Error('项目名称须为 1–64 个字符')
  return checked
}
export function newProject(name: string, words: ArrayLike<number> = [], memory: DataMemory = createMemory(), registers: readonly number[] = Array(32).fill(0)): Project {
  const now = Date.now(), cpu = initialState(registers, memory)
  return Object.freeze({ schemaVersion: PROJECT_SCHEMA, id: `project-${crypto.randomUUID()}`, name: projectName(name),
    createdAt: now, updatedAt: now, instructionROM: validateProgram(words, false), initialRAM: cpu.memory,
    initialRegisters: cpu.registers, ramSize: cpu.memory.length })
}
export function projectRecord(project: Project): ProjectRecord {
  return { ...project, instructionROM: project.instructionROM.toTypedArray(), initialRAM: Uint8Array.from(project.initialRAM), initialRegisters: Uint32Array.from(project.initialRegisters) }
}
function source(value: unknown, kind: 'word' | 'byte' | 'register'): ArrayLike<number> {
  if (!(Array.isArray(value) || value instanceof Uint32Array || value instanceof Uint8Array)) throw new Error(`项目 ${kind} 数据格式无效`)
  const max = kind === 'byte' ? 255 : 0xffffffff
  if (value.length > (kind === 'byte' ? MAX_MEMORY_BYTES : kind === 'word' ? MAX_ROM_WORDS : 32)) throw new Error('项目数据超出容量')
  for (const n of value) if (!Number.isInteger(n) || n < 0 || n > max) throw new Error(`项目 ${kind} 数据超出范围`)
  return value
}
export function restoreProject(value: unknown): Project {
  if (!value || typeof value !== 'object') throw new Error('项目 JSON 须为对象')
  const p = value as Record<string, unknown>
  if (p.schemaVersion !== PROJECT_SCHEMA) throw new Error(`不支持项目 schemaVersion ${String(p.schemaVersion)}，请使用版本 1`)
  if (typeof p.id !== 'string' || !/^project-[\w-]{1,100}$/.test(p.id)) throw new Error('项目 ID 无效')
  if (typeof p.name !== 'string') throw new Error('项目名称无效')
  if (!Number.isSafeInteger(p.createdAt) || !Number.isSafeInteger(p.updatedAt) || Number(p.createdAt) < 0 || Number(p.updatedAt) < Number(p.createdAt)) throw new Error('项目时间戳无效')
  if (!RAM_SIZES.some(size => size === p.ramSize)) throw new Error('项目 RAM 容量不支持')
  const words = source(p.instructionROM, 'word'), bytes = source(p.initialRAM, 'byte'), registers = source(p.initialRegisters, 'register')
  if (bytes.length !== p.ramSize || registers.length !== 32 || registers[0] !== 0) throw new Error('项目初始配置长度无效或 x0 非零')
  return Object.freeze({ schemaVersion: PROJECT_SCHEMA, id: p.id, name: projectName(p.name), createdAt: Number(p.createdAt), updatedAt: Number(p.updatedAt),
    instructionROM: validateProgram(words, false), initialRAM: createMemory(bytes), initialRegisters: Object.freeze(Array.from(registers)), ramSize: bytes.length })
}
// Covers a full 1 MiB ROM plus 1 MiB RAM even as worst-case decimal JSON arrays.
export const MAX_PROJECT_JSON_BYTES = 8 * 1024 * 1024
export function importProjectJSON(text: string): Project {
  if (new TextEncoder().encode(text).length > MAX_PROJECT_JSON_BYTES) throw new Error('项目 JSON 不得超过 8 MiB')
  return restoreProject(JSON.parse(text))
}
export function exportProjectJSON(project: Project): string {
  return JSON.stringify({ ...project, instructionROM: Array.from(project.instructionROM), initialRAM: Array.from(project.initialRAM), initialRegisters: [...project.initialRegisters] }, null, 0)
}
