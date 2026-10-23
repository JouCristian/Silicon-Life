import { beforeEach, describe, expect, it } from 'vitest'
import { initialState, step } from '../core/cpu'
import { encode } from '../core/isa'
import { createMemory, MAX_MEMORY_BYTES, readWord, writeWord } from '../core/memory'
import { PAGE_BYTES, PagedMemory } from '../core/pagedMemory'
import { MAX_ROM_WORDS } from '../core/rom'
import { parseHex } from '../io/hex'
import { editMemory, memoryImage, unifiedMemoryImage } from '../io/memoryImage'
import { exportProjectJSON, importProjectJSON, MAX_PROJECT_JSON_BYTES, newProject, projectRecord, RAM_SIZES, restoreProject } from '../projects/model'
import { useLabStore } from '../stores/useLabStore'

const store = () => useLabStore.getState()
beforeEach(() => useLabStore.setState(useLabStore.getInitialState(), true))

describe('1 MiB byte-addressed RAM', () => {
  it('supports the stack, final byte/word and immutable page writes without aliasing', () => {
    expect(RAM_SIZES).toContain(1048576)
    const memory = createMemory(new Uint8Array(MAX_MEMORY_BYTES))
    const stack = writeWord(memory, 0x93000, 0x89abcdef)
    const end = writeWord(stack, 0xffffc, 0x11223344)
    const byte = editMemory(end, 0xfffff, '255', 8)
    expect(readWord(memory, 0x93000)).toBe(0)
    expect(readWord(byte, 0x93000)).toBe(0x89abcdef)
    expect(readWord(byte, 0xffffc)).toBe(0xff223344)
    expect((byte as PagedMemory).copiedPageBytes).toBe(PAGE_BYTES)
    expect(() => writeWord(byte, 0x100000, 1)).toThrow('范围')
    expect(() => editMemory(byte, 0x100000, '1', 8)).toThrow('边界')
    expect(() => createMemory(new Uint8Array(MAX_MEMORY_BYTES + 4))).toThrow()
  })
  it('executes actual stack SW/LW and keeps Trace address, bytes and register result consistent', () => {
    const program = [
      encode({ op: 'LUI', rd: 2, imm: 0x93 }),
      encode({ op: 'ADDI', rd: 1, rs1: 0, imm: -1 }),
      encode({ op: 'SW', rs1: 2, rs2: 1, imm: -4 }),
      encode({ op: 'LW', rd: 3, rs1: 2, imm: -4 }),
    ]
    let state = initialState(undefined, createMemory(new Uint8Array(MAX_MEMORY_BYTES)))
    for (let i = 0; i < program.length; i++) {
      const result = step(state, program)
      expect(result.state.retired).toBe(i + 1)
      if (i >= 2) {
        expect(result.trace?.memoryAccess).toMatchObject({ address: 0x92ffc, data: 0xffffffff, width: 32 })
        expect(result.trace?.signals.dmem_addr).toBe(0x92ffc)
      }
      state = result.state
    }
    expect(state).toMatchObject({ pc: 16, status: 'halted' })
    expect(state.registers[2]).toBe(0x93000)
    expect(state.registers[3]).toBe(0xffffffff)
    expect(readWord(state.memory, 0x92ffc)).toBe(0xffffffff)
  })
  it.each([0x100000, 0x10000000, 0xffff0000])('rejects unmapped address %i without wrapping into low RAM', address => {
    const regs = Array(32).fill(0); regs[1] = address; regs[2] = 42
    const before = initialState(regs, createMemory(new Uint8Array(MAX_MEMORY_BYTES)))
    for (const instruction of [{ op: 'SW', rs1: 1, rs2: 2, imm: 0 }, { op: 'LW', rd: 3, rs1: 1, imm: 0 }] as const) {
      const result = step(before, [encode(instruction)])
      expect(result.state).toMatchObject({ status: 'fault', retired: 0, pc: 0, fault: { source: 'host' } })
      expect(result.state.memory).toBe(before.memory)
      expect(result.state.registers).toBe(before.registers)
      expect(result.trace).toBeUndefined()
    }
  })
  it('loads the highest byte address through the existing separate RAM parser/loader', () => {
    const image = parseHex('v3.0 hex bytes addressed\nfffff: a5', 8, MAX_MEMORY_BYTES)
    const memory = memoryImage(image, 0, MAX_MEMORY_BYTES)
    expect(image.values.length).toBe(MAX_MEMORY_BYTES)
    expect(memory[0xffffe]).toBe(0)
    expect(memory[0xfffff]).toBe(0xa5)
    expect(() => parseHex('v3.0 hex bytes addressed\n100000: ff', 8, MAX_MEMORY_BYTES)).toThrow('容量')
    expect(() => parseHex('v2.0 raw\n1048577*00', 8, MAX_MEMORY_BYTES)).toThrow('超过')
  })
})

describe('unified initial ROM/RAM image', () => {
  it.each([
    'v3.0 hex words addressed\n00000: 00500093\n00010: 89abcdef\n22bbf: 76543210',
    'v3.0 hex bytes addressed little-endian\n00000: 93005000\n00040: efcdab89\n8aefc: 10325476',
    'v3.0 hex bytes addressed big-endian\n00000: 00500093\n00040: 89abcdef\n8aefc: 76543210',
  ])('maps word cells, byte order and holes once: %s', text => {
    const { program, memory } = unifiedMemoryImage(parseHex(text))
    expect(program.length).toBe(142272)
    expect(memory.length).toBe(1048576)
    expect(program[0]).toBe(0x00500093)
    expect(readWord(memory, 0)).toBe(0x00500093)
    expect(program[0x10]).toBe(0x89abcdef)
    expect(memory.slice(0x40, 0x44)).toEqual([0xef, 0xcd, 0xab, 0x89])
    expect(readWord(memory, 0x8aefc)).toBe(0x76543210)
    expect(readWord(memory, 0x3c)).toBe(0)
    expect(readWord(memory, 0x93000)).toBe(0)
    expect(readWord(memory, 0xffffc)).toBe(0)
  })
  it('atomically resets execution and both images, preserves initial registers and project identity', () => {
    store().createProject('image')
    store().setInitialRegister(9, 42)
    const id = store().activeProjectId
    store().step(); store().runFast()
    const image = parseHex('v3.0 hex words addressed\n0: 00500093\n10: ffffffff')
    const updates: unknown[] = [], off = useLabStore.subscribe(s => updates.push(s))
    store().importUnifiedImage(image); off()
    expect(updates).toHaveLength(1)
    expect(store()).toMatchObject({ activeProjectId: id, fastRunning: false, running: false, playing: false, cpu: { pc: 0, retired: 0, status: 'ready' } })
    expect(store().initialRegisters[9]).toBe(42)
    expect(store().cpu.registers[9]).toBe(42)
    expect(store().history).toHaveLength(0)
    expect(store().cpu.memory).toBe(store().initialMemory)
    expect(store().projects.find(p => p.id === id)).toMatchObject({ ramSize: 1048576, initialRAM: store().initialMemory, instructionROM: store().program })
    expect(store().projectNotice).toContain('加载成功')
    // Mutating runtime RAM must not mutate initial RAM or ROM.
    const changed = writeWord(store().cpu.memory, 0, 0)
    expect(readWord(changed, 0)).toBe(0)
    expect(readWord(store().initialMemory, 0)).toBe(0x00500093)
    expect(store().program[0]).toBe(0x00500093)
    store().reset(); expect(readWord(store().cpu.memory, 0x40)).toBe(0xffffffff)
  })
  it('rejects invalid/oversized images and storage-not-ready without partially replacing anything', () => {
    const valid = parseHex('00500093')
    for (const image of [{ ...valid, width: 8 as const }, { ...valid, values: [] }, { ...valid, values: [-1] }, { ...valid, values: new Array(MAX_ROM_WORDS + 1).fill(0) }]) {
      const before = store()
      expect(() => store().importUnifiedImage(image)).toThrow()
      expect(store()).toBe(before)
    }
    useLabStore.setState({ storageReady: false })
    const before = store()
    expect(() => store().importUnifiedImage(valid)).toThrow('恢复')
    expect(store()).toBe(before)
  })
  it('keeps independent ROM import, RAM resizing and project switching behavior', () => {
    store().createProject('large')
    store().resizeMemory(MAX_MEMORY_BYTES)
    store().setInitialMemory(writeWord(store().initialMemory, 0x93000, 42))
    store().importProgram([0x00500093])
    const id = store().activeProjectId
    expect(readWord(store().initialMemory, 0x93000)).toBe(42)
    store().createProject('other')
    expect(store().initialMemory.length).toBe(1024)
    store().loadProgram(id)
    expect(store().initialMemory.length).toBe(MAX_MEMORY_BYTES)
    expect(readWord(store().cpu.memory, 0x93000)).toBe(42)
  })
  it('round-trips maximum ROM and RAM through IndexedDB record and bounded JSON backup', () => {
    const project = newProject('full image', new Uint32Array(MAX_ROM_WORDS).fill(0xffffffff), createMemory(new Uint8Array(MAX_MEMORY_BYTES).fill(255)))
    const record = projectRecord(project), restored = restoreProject(structuredClone(record))
    record.initialRAM[0x93000] = 0
    const json = exportProjectJSON(project)
    expect(new TextEncoder().encode(json).length).toBeLessThan(MAX_PROJECT_JSON_BYTES)
    expect(json.length).toBeGreaterThan(4 * 1024 * 1024)
    const backup = importProjectJSON(json)
    for (const p of [restored, backup]) {
      expect(p.schemaVersion).toBe(1)
      expect(p.ramSize).toBe(MAX_MEMORY_BYTES)
      expect(p.initialRAM).toBeInstanceOf(PagedMemory)
      expect(readWord(p.initialRAM, 0x93000)).toBe(0xffffffff)
      expect(readWord(p.initialRAM, 0xffffc)).toBe(0xffffffff)
      expect(p.instructionROM.length).toBe(MAX_ROM_WORDS)
      expect(p.instructionROM[MAX_ROM_WORDS - 1]).toBe(0xffffffff)
    }
  })
})
