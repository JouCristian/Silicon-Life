import { beforeEach, describe, expect, it } from 'vitest'
import { initialState, step } from '../core/cpu'
import { DISPLAY_BASE, DISPLAY_BYTES, initialDisplay, writeDisplay } from '../core/devices/logisimDisplay'
import { encode, type Instruction } from '../core/isa'
import { readWord } from '../core/memory'
import { PagedMemory, PAGE_BYTES } from '../core/pagedMemory'
import { parseHex } from '../io/hex'
import { exportProjectJSON, importProjectJSON } from '../projects/model'
import { useLabStore } from '../stores/useLabStore'

const store = () => useLabStore.getState()
const registers = (address: number, value = 0x89123456) => { const r = Array(32).fill(0); r[1] = address; r[2] = value; return r }
const sw = encode({ op: 'SW', rs1: 1, rs2: 2, imm: 0 })
beforeEach(() => useLabStore.setState(useLabStore.getInitialState(), true))

describe('Logisim RGB Video MMIO', () => {
  it.each([
    [0, 0, 0], [4, 1, 0], [1020, 255, 0], [1024, 0, 1], [DISPLAY_BYTES - 4, 255, 255],
  ])('decodes offset %i into (%i,%i) and RGB888 low 24 bits', (offset, x, y) => {
    const before = initialDisplay(), after = writeDisplay(before, DISPLAY_BASE + offset, 0xab123456)
    expect(after.lastWrite).toEqual({ address: DISPLAY_BASE + offset, x, y, rgb: 0x123456 })
    expect(readWord(after.pixels, offset)).toBe(0x123456)
    expect(after.pixels.slice(offset, offset + 4)).toEqual([0x56, 0x34, 0x12, 0])
    expect(readWord(before.pixels, offset)).toBe(0)
    expect(after.writes).toBe(1)
    expect((after.pixels as PagedMemory).copiedPageBytes).toBe(PAGE_BYTES)
    expect(() => { (after.pixels as unknown as number[])[offset] = 9 }).toThrow()
  })
  it('commits one SW on the existing bus without changing RAM, ROM or registers', () => {
    const before = initialState(registers(DISPLAY_BASE)), program = [sw]
    const { state: after, trace } = step(before, program)
    expect(after).toMatchObject({ pc: 4, retired: 1, status: 'halted' })
    expect(after.memory).toBe(before.memory)
    expect(after.registers).toEqual(before.registers)
    expect(program).toEqual([sw])
    expect(after.display.writes).toBe(1)
    expect(trace?.signals).toMatchObject({ dmem_addr: DISPLAY_BASE, dmem_wdata: 0x89123456, dmem_we: 1, dmem_wstrb: 15, mem_write: 1, rf_we: 0 })
    expect(trace?.memoryAccess).toMatchObject({ kind: 'store', space: 'mmio', address: DISPLAY_BASE, data: 0x89123456, width: 32 })
    expect(trace?.mmioWrite).toEqual({ address: DISPLAY_BASE, x: 0, y: 0, rgb: 0x123456 })
    expect(trace?.before.display.writes).toBe(0)
    expect(trace?.after.display.writes).toBe(1)
    expect(trace?.transfers.some(t => t.from === 'dmem' || t.to === 'dmem')).toBe(false)
    expect(trace?.phases.memory).not.toContain('dmem')
    expect(trace?.visualizationOmissions?.join()).toContain('MMIO')
  })
  it.each([DISPLAY_BASE - 4, DISPLAY_BASE + DISPLAY_BYTES, 0x10000000, 0xfffffffc])('rejects unmapped address %i without modulo/alias or partial commit', address => {
    const before = initialState(registers(address)), { state, trace } = step(before, [sw])
    expect(state).toMatchObject({ status: 'fault', pc: 0, retired: 0, fault: { source: 'host' } })
    expect(state.memory).toBe(before.memory)
    expect(state.display).toBe(before.display)
    expect(state.registers).toBe(before.registers)
    expect(trace).toBeUndefined()
  })
  it.each(['SB', 'SH', 'LW', 'LBU'] as const)('explicitly rejects unverified display %s protocol without faking RAM/readback', op => {
    const instruction: Instruction = op === 'SB' || op === 'SH' ? { op, rs1: 1, rs2: 2, imm: 0 } : { op, rd: 3, rs1: 1, imm: 0 }
    const before = initialState(registers(DISPLAY_BASE)), { state } = step(before, [encode(instruction)])
    expect(state).toMatchObject({ status: 'fault', retired: 0, pc: 0 })
    expect(state.reason).toContain('MMIO')
    expect(state.memory).toBe(before.memory)
    expect(state.display).toBe(before.display)
    expect(state.registers).toBe(before.registers)
  })
  it('checks alignment before device writes and preserves single architectural commit', () => {
    const before = initialState(registers(DISPLAY_BASE + 1)), result = step(before, [sw])
    expect(result.state).toMatchObject({ status: 'fault', retired: 0, fault: { source: 'rtl', cause: 6 } })
    expect(result.state.display).toBe(before.display)
    expect(() => writeDisplay(before.display, DISPLAY_BASE + 1, 1)).toThrow()
    expect(() => writeDisplay(before.display, DISPLAY_BASE + DISPLAY_BYTES, 1)).toThrow()
  })
  it('preserves previous pixel snapshots and ordinary RAM accesses remain on RAM', () => {
    const before = initialState(registers(DISPLAY_BASE)), a = step(before, [sw]).state
    const b = step({ ...a, status: 'ready', pc: 0, registers: registers(DISPLAY_BASE, 0x00abcdef) }, [sw]).state
    expect(readWord(a.display.pixels, 0)).toBe(0x123456)
    expect(readWord(b.display.pixels, 0)).toBe(0xabcdef)
    expect(b.display.writes).toBe(2)
    const ram = step({ ...b, status: 'ready', pc: 0, registers: registers(64, 42) }, [sw])
    expect(readWord(ram.state.memory, 64)).toBe(42)
    expect(ram.state.display).toBe(b.display)
    expect(ram.trace?.memoryAccess?.space).toBe('ram')
    expect(ram.trace?.mmioWrite).toBeUndefined()
    expect(ram.trace?.transfers.some(t => t.to === 'dmem')).toBe(true)
  })
})

describe('device execution versus presentation and projects', () => {
  it('runs, pauses and replays without repeating device writes; reset/import/switch clear runtime device only', () => {
    store().createProject('display')
    store().setInitialRegister(1, DISPLAY_BASE)
    store().setInitialRegister(2, 0xff0000)
    store().importProgram([sw, encode({ op: 'ADDI', rd: 2, rs1: 0, imm: 255 }), sw])
    const id = store().activeProjectId
    store().step(); store().pause()
    const once = store().cpu
    expect(once.display.writes).toBe(1)
    store().replay(0); store().observe('memory'); store().stepTransfer(); store().pause()
    expect(store().cpu).toBe(once)
    expect(store().cpu.display.writes).toBe(1)
    store().runFast(); store().fastBatch(); store().pause()
    expect(store().cpu).toMatchObject({ retired: 3, status: 'halted' })
    expect(store().cpu.display.writes).toBe(2)
    expect(readWord(store().cpu.display.pixels, 0)).toBe(255)
    const finished = store().cpu
    for (let i = 0; i < store().history.length; i++) { store().replay(i); store().observe('writeback') }
    expect(store().cpu).toBe(finished)
    const project = store().projects.find(p => p.id === id)!
    const json = exportProjectJSON(project)
    expect(JSON.parse(json).display).toBeUndefined()
    expect(importProjectJSON(json).initialRAM).toEqual(project.initialRAM)
    store().reset(); expect(store().cpu.display.writes).toBe(0)
    store().step(); store().pause(); expect(store().cpu.display.writes).toBe(1)
    store().createProject('other'); expect(store().cpu.display.writes).toBe(0)
    store().loadProgram(id); expect(store().cpu.display.writes).toBe(0)
    store().step(); store().pause(); expect(store().cpu.display.writes).toBe(1)
    store().importUnifiedImage(parseHex('00500093')); expect(store().cpu.display.writes).toBe(0)
  })
})
