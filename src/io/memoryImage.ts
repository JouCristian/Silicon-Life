import { createMemory, MEMORY_BYTES, readWord, writeWord, type DataMemory } from '../core/memory'
import { u32 } from '../core/isa'
import type { CellWidth, HexImage } from './hex'

export function parseValue(text: string, width: CellWidth): number {
  const source = text.trim()
  if (!/^(?:0x[\da-f]+|-?\d+)$/i.test(source)) throw new Error('请输入十进制整数或 0x 开头的十六进制整数')
  const value = Number(source)
  const min = width === 8 ? 0 : -0x80000000, max = width === 8 ? 255 : 0xffffffff
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`数据超出 ${width} 位范围`)
  return width === 32 ? u32(value) : value
}

export function checkAddress(address: number, width: CellWidth, count = 1): void {
  const size = width / 8
  if (!Number.isInteger(address) || address < 0 || !Number.isInteger(count) || count < 1 || address + count * size > MEMORY_BYTES) throw new Error('数据超出 1024 字节 RAM 边界')
  if (address % size) throw new Error('32 位数据必须按 4 字节对齐')
}

export function editMemory(memory: DataMemory, address: number, text: string, width: CellWidth): DataMemory {
  checkAddress(address, width)
  const value = parseValue(text, width)
  if (width === 32) return writeWord(memory, address, value)
  const bytes = [...memory]; bytes[address] = value
  return createMemory(bytes)
}

/** Replace the entire image: unspecified bytes are zero, cell addresses map to byte offsets. */
export function memoryImage(image: HexImage, address = 0): DataMemory {
  checkAddress(address, image.width, image.values.length)
  const bytes = Array<number>(MEMORY_BYTES).fill(0)
  image.values.forEach((value, i) => {
    const checked = parseValue(String(value), image.width)
    for (let lane = 0; lane < image.width / 8; lane++) bytes[address + i * image.width / 8 + lane] = checked >>> (lane * 8) & 255
  })
  return createMemory(bytes)
}

export function memoryCells(memory: DataMemory, width: CellWidth): readonly number[] {
  return width === 8 ? [...memory] : Array.from({ length: memory.length / 4 }, (_, i) => readWord(memory, i * 4))
}
