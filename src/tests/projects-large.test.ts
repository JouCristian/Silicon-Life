import { beforeEach, describe, expect, it } from 'vitest'
import { initialState, step } from '../core/cpu'
import { createMemory, readWord, writeWord } from '../core/memory'
import { PagedMemory, PAGE_BYTES } from '../core/pagedMemory'
import { InstructionROM } from '../core/rom'
import { exportProjectJSON, importProjectJSON, newProject, projectRecord, restoreProject } from '../projects/model'
import { useLabStore, HISTORY_LIMIT } from '../stores/useLabStore'
import { parseHex } from '../io/hex'
import { instructionRow } from '../io/program'
import { SaveQueue } from '../projects/saveQueue'
import type { Repository } from '../projects/database'

const store = () => useLabStore.getState()
beforeEach(() => useLabStore.setState(useLabStore.getInitialState(), true))
function fastFinish() { store().runFast(); for (let n = 0; n < 50000 && store().fastRunning; n++) store().fastBatch() }

describe('compact ROM and paged RAM', () => {
  it('owns ROM buffers and does not expose mutable storage', () => {
    const input = Uint32Array.of(0xfff00093), rom = new InstructionROM(input)
    input[0] = 0; expect(rom[0]).toBe(0xfff00093)
    rom.toTypedArray()[0] = 0; expect(rom[0]).toBe(0xfff00093)
    expect(() => { (rom as unknown as number[])[0] = 0 }).toThrow()
    expect(() => new InstructionROM([-1])).toThrow()
    expect(() => createMemory({ length: NaN })).toThrow()
  })
  it('read-only collection callbacks and valueOf cannot leak writable backing state', () => {
    const rom = new InstructionROM([0x00500093]), memory = createMemory(new Uint8Array(65536))
    const extras: unknown[] = []
    rom.forEach(function () { extras.push(arguments[2]) })
    rom.some(function () { extras.push(arguments[2]); return false })
    rom.every(function () { extras.push(arguments[2]); return true })
    expect(extras).toEqual([undefined, undefined, undefined])
    expect(Object.isFrozen(rom.valueOf())).toBe(true)
    expect(Object.isFrozen(memory.valueOf())).toBe(true)
    expect(() => Object.assign(rom.valueOf(), { length: 0 })).toThrow()
    expect(() => Object.assign(memory.valueOf(), { length: 0 })).toThrow()
  })
  it.each([65536, 262144])('RAM %i bytes: copies one page per SW and preserves atomic immutable snapshots', size => {
    const before = createMemory(new Uint8Array(size)), after = writeWord(before, size - 4, 0x11223344)
    expect(before).toBeInstanceOf(PagedMemory)
    expect(readWord(before, size - 4)).toBe(0)
    expect(after.slice(size - 4)).toEqual([0x44, 0x33, 0x22, 0x11])
    expect((after as PagedMemory).copiedPageBytes).toBe(PAGE_BYTES)
    expect(createMemory(after)).toBe(after)
    const registers = Array(32).fill(0); registers[1] = size - 4; registers[2] = 42
    const state = initialState(registers, before), result = step(state, [0x0020a023])
    expect(readWord(result.state.memory, size - 4)).toBe(42)
    expect(readWord(state.memory, size - 4)).toBe(0)
    expect(step(initialState([0, size - 3, ...Array(30).fill(0)], before), [0x0020a023]).state.memory).toBe(before)
  })
  it.each([4096, 65536])('imports and executes %i real instructions beyond 1000; history remains bounded', count => {
    const parsed = parseHex(`v2.0 raw\n${count}*00108093`, 32, 65536) // ADDI x1,x1,1
    store().importProgram(parsed.values)
    expect(store().program).toBeInstanceOf(InstructionROM)
    expect((store().program as InstructionROM).byteLength).toBe(count * 4)
    fastFinish()
    expect(store().cpu).toMatchObject({ pc: count * 4, retired: count, status: 'halted' })
    expect(store().cpu.registers[1]).toBe(count)
    expect(store().cpu.registers[0]).toBe(0)
    expect(store().history).toHaveLength(HISTORY_LIMIT)
    expect(store().history[0].id).toBe(count - HISTORY_LIMIT + 1)
    const after = store().cpu
    store().replay(0); store().observe('writeback'); expect(store().cpu).toBe(after)
  }, 15000)
  it('bounded batches can be paused and a real backward loop stops at a renewable budget', () => {
    store().importProgram([0x00000063]) // BEQ x0,x0,0
    store().setExecutionLimit(1000); store().runFast(); store().fastBatch()
    const retired = store().cpu.retired
    expect(retired).toBeGreaterThan(0); expect(retired).toBeLessThanOrEqual(512)
    store().pause(); store().fastBatch(); expect(store().cpu.retired).toBe(retired)
    fastFinish(); expect(store().cpu.retired).toBe(retired + 1000)
    expect(store().cpu.status).toBe('ready'); expect(store().executionNotice).toContain('1000')
    expect(store().fastRunning).toBe(false); expect(store().history).toHaveLength(HISTORY_LIMIT)
  })
  it('raw unsupported words remain visible and fault at the correct PC without partial commits', () => {
    store().importProgram([0x00500093, 0xffffffff, 0x00700113])
    expect(instructionRow(store().program, 1)).toMatchObject({ word: 0xffffffff, instruction: undefined })
    fastFinish()
    expect(store().cpu).toMatchObject({ status: 'fault', pc: 4, retired: 1 })
    expect(store().cpu.reason).toContain('0x00000004')
    expect(store().cpu.reason).toContain('0xffffffff')
    expect(store().cpu.registers[1]).toBe(5); expect(store().cpu.registers[2]).toBe(0)
    expect(() => store().importProgram([0xffffffff], false, true)).toThrow()
  })
})

describe('ten independent projects', () => {
  it('creates, copies, renames, switches, deletes and rejects the eleventh without mutation', () => {
    store().createProject('A'); const a = store().activeProjectId
    store().importProgram([0x00500093]); store().setInitialRegister(2, 99)
    store().setInitialMemory(writeWord(store().initialMemory, 64, 42))
    store().createProject('B', true); const b = store().activeProjectId
    store().setInitialMemory(writeWord(store().initialMemory, 64, 7)); store().renameProject('B renamed')
    store().step(); store().loadProgram(a)
    expect(store().history).toHaveLength(0); expect(store().cpu.retired).toBe(0)
    expect(readWord(store().initialMemory, 64)).toBe(42); expect(store().initialRegisters[2]).toBe(99)
    store().loadProgram(b); expect(readWord(store().initialMemory, 64)).toBe(7)
    expect(store().projects.find(p => p.id === b)?.name).toBe('B renamed')
    for (let i = 2; i < 10; i++) store().createProject()
    const before = store(); expect(() => store().createProject()).toThrow('10'); expect(store()).toBe(before)
    store().deleteProject(); expect(store().projects).toHaveLength(9); expect(store().activeProjectId).toBe('arithmetic')
    expect(() => store().deleteProject()).toThrow('内置示例')
  })
  it('project JSON and binary database records round-trip the complete configuration, never Trace', () => {
    const memory = writeWord(createMemory(new Uint8Array(262144)), 262140, 0xaabbccdd)
    const project = newProject('test', Uint32Array.of(0xffffffff, 0x00500093), memory, [0, 0xffffffff, ...Array(30).fill(0)])
    const text = exportProjectJSON(project), restored = importProjectJSON(text), binary = restoreProject(projectRecord(project))
    expect(Array.from(restored.instructionROM)).toEqual([0xffffffff, 0x00500093])
    expect(exportProjectJSON(binary)).toBe(text)
    expect(readWord(restored.initialRAM, 262140)).toBe(0xaabbccdd)
    expect(restored.initialRegisters[1]).toBe(0xffffffff)
    expect(text).not.toContain('history'); expect(text).not.toContain('retired')
    store().importProject(restored); expect(store().activeProjectId).not.toBe(project.id)
  })
  it.each([{ schemaVersion: 999 }, { schemaVersion: 1 }, { ...JSON.parse(exportProjectJSON(newProject('test'))), initialRegisters: Array(32).fill(-1) }])('rejects bad project JSON atomically', bad => {
    const before = store()
    expect(() => store().importProject(importProjectJSON(JSON.stringify(bad)))).toThrow()
    expect(store()).toBe(before)
  })
})

describe('serialized save queue', () => {
  it('an old asynchronous completion cannot acknowledge newer edits or overwrite project switching', async () => {
    let release!: () => void
    const writes: string[] = [], statuses: string[] = []
    const repository: Repository = { load: async () => ({ projects: [], selected: 'arithmetic', revision: 0 }), close: () => {},
      commit: async (projects, selected, revision) => { writes.push(`${selected}:${projects[0]?.name}`); if (writes.length === 1) await new Promise<void>(resolve => { release = resolve }); return revision + 1 } }
    const queue = new SaveQueue(repository, 0, status => statuses.push(status))
    const a = newProject('A'), b = newProject('B')
    queue.request([a], a.id); await Promise.resolve(); await Promise.resolve()
    queue.request([a, b], b.id); queue.request([{ ...a, name: 'A edited' }, b], a.id)
    expect(statuses).not.toContain('saved'); release()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(writes).toHaveLength(2); expect(writes[1]).toBe(`${a.id}:A edited`)
    expect(statuses.at(-1)).toBe('saved')
  })
  it('quota/storage failure is never marked saved and keeps pending edits', async () => {
    const statuses: string[] = []
    const repository: Repository = { load: async () => ({ projects: [], selected: '', revision: 0 }), close: () => {}, commit: async () => { throw new Error('QuotaExceededError') } }
    const queue = new SaveQueue(repository, 0, (status, error) => statuses.push(`${status}:${error ?? ''}`))
    queue.request([newProject('A')], 'a'); await new Promise(resolve => setTimeout(resolve, 0))
    expect(statuses.at(-1)).toContain('error:QuotaExceededError')
    expect(statuses.some(s => s.startsWith('saved'))).toBe(false)
    queue.request([newProject('B')], 'b'); expect(statuses.at(-1)).toContain('error:')
  })
})
