import { beforeEach, describe, expect, it } from 'vitest'
import { encode } from '../core/isa'
import { readWord } from '../core/memory'
import { PROGRAMS } from '../data/programs'
import { parseHex } from '../io/hex'
import { editMemory, memoryImage } from '../io/memoryImage'
import { insertWord, moveWord, programListing, removeWord, validateProgram } from '../io/program'
import { useLabStore } from '../stores/useLabStore'

const store = () => useLabStore.getState()
const add = (imm: number) => encode({ op: 'ADDI', rd: 1, rs1: 0, imm })
function finish() { store().run(); for (let i = 0; i < 5100 && (store().playing || store().running); i++) store().tick() }
beforeEach(() => useLabStore.setState(useLabStore.getInitialState(), true))

describe('custom programs and address mapping', () => {
  it.each([0, 1, 37, 256])('supports %i instructions with capacity guard', length => {
    store().createCustomProgram(Array(length).fill(add(5)))
    expect(store().program).toHaveLength(length)
    expect(store().selectedInstruction).toBe(length ? 0 : -1)
    finish(); expect(store().cpu.retired).toBe(length)
    expect(store().cpu.pc).toBe(length * 4)
    expect(store().cpu.registers[0]).toBe(0)
  })
  it('inserts, deletes and reorders immutably; selection never points outside program', () => {
    const original = [add(1), add(2)]
    expect(moveWord(insertWord(original, 1, add(3)), 2, 0)).toEqual([add(2), add(1), add(3)])
    expect(removeWord(original, 1)).toEqual([add(1)])
    expect(original).toEqual([add(1), add(2)])
    store().createCustomProgram(original); store().insertInstruction(1); store().moveInstruction(1, 2)
    expect(store().selectedInstruction).toBe(2)
    store().deleteInstruction(2); expect(store().selectedInstruction).toBe(1)
    store().deleteInstruction(1); store().deleteInstruction(0)
    expect(store().selectedInstruction).toBe(-1)
    expect(() => store().deleteInstruction(0)).toThrow()
    expect(() => store().moveInstruction(0, 1)).toThrow()
  })
  it('shows PC-relative targets without silently rewriting BEQ on move', () => {
    const beq = encode({ op: 'BEQ', rs1: 0, rs2: 0, imm: 8 })
    const words = [beq, add(1), add(2)]
    expect(programListing(words)[0]).toMatchObject({ address: 0, target: 8, targetValid: true })
    const moved = moveWord(words, 0, 2)
    expect(moved[2]).toBe(beq)
    expect(programListing(moved)[2]).toMatchObject({ address: 8, target: 16, targetValid: false })
    expect(programListing([encode({ op: 'BEQ', rs1: 0, rs2: 0, imm: 2 })])[0].targetValid).toBe(false)
  })
  it('preserves constants and custom baseline across preset switching', () => {
    const originals = JSON.stringify(PROGRAMS)
    store().createCustomProgram(store().program)
    store().updateInstruction(0, { op: 'ADDI', rd: 1, rs1: 0, imm: 9 })
    const custom = store().program
    store().loadProgram('branch'); store().loadProgram('custom')
    expect(store().program).toEqual(custom)
    store().restoreCustomProgram(); finish()
    expect(store().cpu.registers[3]).toBe(12)
    expect(JSON.stringify(PROGRAMS)).toBe(originals)
  })
  it('rejects bad/oversized imports atomically, including append capacity', () => {
    const before = store()
    for (const words of [[0xffffffff], [], Array(257).fill(add(1))]) expect(() => store().importProgram(words)).toThrow()
    expect(store()).toBe(before)
    store().createCustomProgram(Array(256).fill(add(1)))
    const full = store()
    expect(() => store().importProgram([add(2)], true)).toThrow()
    expect(store()).toBe(full)
    expect(() => validateProgram([-1])).toThrow()
  })
  it('publishes one coherent reset transaction and invalidates old playback', () => {
    store().step(); const epoch = store().playbackEpoch
    const snapshots: ReturnType<typeof store>[] = []
    const unsubscribe = useLabStore.subscribe(s => snapshots.push(s))
    store().importProgram([add(7)], true); unsubscribe()
    expect(snapshots).toHaveLength(1)
    expect(store().program).toHaveLength(4)
    expect(store().history).toHaveLength(0)
    expect(store().traceIndex).toBe(-1)
    expect(store().playing).toBe(false)
    expect(store().cpu.pc).toBe(0)
    expect(store().playbackEpoch).toBeGreaterThan(epoch)
  })
})

describe('initial configuration survives execution and reset', () => {
  it('LW reads manually configured RAM; SW modifies runtime only; reset restores both configurations', () => {
    store().setInitialMemory(editMemory(store().initialMemory, 64, '42', 32))
    store().setInitialRegister(2, 99)
    store().createCustomProgram([encode({ op: 'LW', rd: 3, rs1: 0, imm: 64 }), encode({ op: 'SW', rs2: 2, rs1: 0, imm: 64 })])
    finish()
    expect(store().cpu.registers[3]).toBe(42)
    expect(readWord(store().cpu.memory, 64)).toBe(99)
    expect(readWord(store().initialMemory, 64)).toBe(42)
    const committed = store().cpu
    store().replay(1); for (let i = 0; i < 8; i++) store().tick()
    expect(store().cpu).toBe(committed)
    expect(() => store().setInitialMemory(store().initialMemory)).toThrow('复位')
    store().reset()
    expect(readWord(store().cpu.memory, 64)).toBe(42)
    expect(store().cpu.registers[2]).toBe(99)
    expect(store().cpu.registers[3]).toBe(0)
    store().loadProgram('branch'); store().insertInstruction(0)
    expect(readWord(store().cpu.memory, 64)).toBe(42)
    expect(store().cpu.registers[2]).toBe(99)
  })
  it('HEX import agrees with manual RAM and is independently immutable', () => {
    const image = memoryImage(parseHex('v2.0 raw\n16*00000000 0000002a'))
    store().setInitialMemory(image)
    store().importProgram([encode({ op: 'LW', rd: 3, rs1: 0, imm: 64 })]); finish()
    expect(store().cpu.registers[3]).toBe(42)
    expect(Object.isFrozen(store().cpu.memory)).toBe(true)
    expect(store().cpu.memory).not.toBe(store().initialMemory)
    store().reset(); expect(readWord(store().cpu.memory, 64)).toBe(42)
  })
})
