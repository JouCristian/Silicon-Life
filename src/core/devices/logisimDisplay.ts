import { createMemory, writeWord, type DataMemory } from '../memory'

// Read from the user's minirv.circ: LSU comparators, address/data splitters,
// VGA_WE = MemWrite & isVGA, and main's 256x256 RGB Video component.
export const DISPLAY_BASE = 0x20000000
export const DISPLAY_WIDTH = 256
export const DISPLAY_HEIGHT = 256
export const DISPLAY_BYTES = DISPLAY_WIDTH * DISPLAY_HEIGHT * 4
export interface DisplayWrite {
  readonly address: number
  readonly x: number
  readonly y: number
  readonly rgb: number
}
export interface DisplayState {
  readonly pixels: DataMemory
  readonly writes: number
  readonly lastWrite?: DisplayWrite
}
// Immutable black framebuffer may safely be shared by resets and CPU instances.
const BLACK: DisplayState = Object.freeze({ pixels: createMemory(new Uint8Array(DISPLAY_BYTES)), writes: 0 })
export function initialDisplay(): DisplayState { return BLACK }
export function isDisplayAddress(address: number, bytes = 1): boolean {
  return Number.isInteger(address) && address >= DISPLAY_BASE && address + bytes <= DISPLAY_BASE + DISPLAY_BYTES
}

/** Minimal verified protocol: aligned SW, immediate pixel update, RGB888 low
 * 24 bits. No guessed status/sync registers, readback or partial-write protocol. */
export function writeDisplay(display: DisplayState, address: number, value: number): DisplayState {
  if (!isDisplayAddress(address, 4) || address % 4) throw new Error('显示 MMIO 地址越界或未按 4 字节对齐')
  const offset = address - DISPLAY_BASE, index = offset / 4, rgb = value & 0xffffff
  return Object.freeze({ pixels: writeWord(display.pixels, offset, rgb), writes: display.writes + 1,
    lastWrite: Object.freeze({ address, x: index % DISPLAY_WIDTH, y: Math.floor(index / DISPLAY_WIDTH), rgb }) })
}
