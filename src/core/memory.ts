import { u32 } from './isa'
import { MAX_MEMORY_BYTES, PagedMemory } from './pagedMemory'
export { MAX_MEMORY_BYTES } from './pagedMemory'

export const MEMORY_BYTES = 1024
export type DataMemory = readonly number[] | PagedMemory

export function createMemory(bytes: ArrayLike<number> = new Uint8Array(MEMORY_BYTES)): DataMemory {
  if (bytes instanceof PagedMemory) return bytes
  if (!Number.isInteger(bytes.length) || bytes.length < 4 || bytes.length > MAX_MEMORY_BYTES || bytes.length % 4) throw new Error(`内存须为 4–${MAX_MEMORY_BYTES} 字节、4 字节对齐的字节数组`)
  for (let i = 0; i < bytes.length; i++) if (!Number.isInteger(bytes[i]) || bytes[i] < 0 || bytes[i] > 255) throw new Error('内存包含非法字节')
  return bytes.length > MEMORY_BYTES ? new PagedMemory(bytes) : Object.freeze(Array.from(bytes))
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
  if (memory instanceof PagedMemory) return memory.withBytes(address, Array.from({ length: 4 }, (_, lane) => strobes & (1 << lane) ? data >>> (lane * 8) & 255 : memory[address + lane]))
  const bytes = [...memory]
  for (let lane = 0; lane < 4; lane++) if (strobes & (1 << lane)) bytes[address + lane] = (data >>> (lane * 8)) & 255
  return Object.freeze(bytes)
}
