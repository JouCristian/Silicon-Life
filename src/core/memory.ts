import { u32 } from './isa'

export const MEMORY_BYTES = 1024
export type DataMemory = readonly number[]

export function createMemory(bytes: readonly number[] = Array(MEMORY_BYTES).fill(0)): DataMemory {
  if (bytes.length < 4 || bytes.length > 65536 || bytes.length % 4 || bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255))
    throw new Error('内存须为 4–65536 字节、4 字节对齐的字节数组')
  return Object.freeze([...bytes])
}

export function checkWord(memory: DataMemory, address: number): void {
  if (!Number.isInteger(address) || address < 0 || address + 3 >= memory.length) throw new Error('数据地址超出宿主内存范围')
  if (address % 4) throw new Error('数据地址未按 4 字节对齐')
}

export function readWord(memory: DataMemory, address: number): number {
  checkWord(memory, address)
  return u32(memory[address] | (memory[address + 1] << 8) | (memory[address + 2] << 16) | (memory[address + 3] << 24))
}

/** Pure little-endian bus write. Validation happens before any byte is changed. */
export function writeWord(memory: DataMemory, address: number, data: number, strobes = 15): DataMemory {
  checkWord(memory, address)
  if (!Number.isInteger(strobes) || strobes < 0 || strobes > 15) throw new Error('无效字节选通')
  const bytes = [...memory]
  for (let lane = 0; lane < 4; lane++) if (strobes & (1 << lane)) bytes[address + lane] = (data >>> (lane * 8)) & 255
  return Object.freeze(bytes)
}
