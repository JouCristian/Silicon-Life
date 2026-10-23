import { beforeEach, describe, expect, it } from 'vitest'
import { initialState, step } from '../core/cpu'
import { createMemory } from '../core/memory'
import { InstructionROM, MAX_ROM_WORDS } from '../core/rom'
import { parseHex } from '../io/hex'
import { instructionRow, programListing, validateProgram } from '../io/program'
import { exportProjectJSON, importProjectJSON, newProject, projectRecord, restoreProject } from '../projects/model'
import { useLabStore } from '../stores/useLabStore'
import { addressedRomFixture } from './fixtures/largeRom'

beforeEach(() => useLabStore.setState(useLabStore.getInitialState(), true))

describe('on-demand 1MiB ROM', () => {
  it.each([75184, 142272, MAX_ROM_WORDS])('preserves all %i addressed words through import, paging, project records and JSON', count => {
    const fixture = addressedRomFixture(count)
    const parsed = parseHex(fixture.text)
    expect(Uint32Array.from(parsed.values)).toEqual(fixture.words)
    const store = useLabStore.getState()
    store.importProgram(parsed.values)
    const loaded = useLabStore.getState()
    expect(loaded.projectNotice).toContain('HEX 加载成功')
    expect(loaded.projectNotice).toContain('不代表可以完整运行')
    expect(loaded.cpu.retired).toBe(0)
    expect(loaded.program.length).toBe(count)
    expect((loaded.program as InstructionROM).byteLength).toBe(count * 4)
    const lastPage = programListing(loaded.program, Math.floor((count - 1) / 16) * 16, count)
    expect(lastPage.length).toBeLessThanOrEqual(16)
    expect(lastPage.at(-1)).toMatchObject({ index: count - 1, address: (count - 1) * 4, word: fixture.words[count - 1] })
    expect(instructionRow(loaded.program, 65536).word).toBe(fixture.words[65536])
    const project = loaded.projects.find(p => p.id === loaded.activeProjectId)!
    // The IndexedDB transport is exactly projectRecord -> structured clone -> restoreProject.
    const databaseRoundTrip = restoreProject(structuredClone(projectRecord(project)))
    const jsonRoundTrip = importProjectJSON(exportProjectJSON(project))
    expect(databaseRoundTrip.instructionROM.toTypedArray()).toEqual(fixture.words)
    expect(jsonRoundTrip.instructionROM.toTypedArray()).toEqual(fixture.words)
    store.loadProgram('arithmetic')
    store.loadProgram(project.id)
    expect((useLabStore.getState().program as InstructionROM).toTypedArray()).toEqual(fixture.words)
    // Fetch the last real instruction directly; avoid a long 262144-step run.
    const before = { ...initialState(), pc: (count - 1) * 4 }
    const result = step(before, databaseRoundTrip.instructionROM)
    expect(result.trace?.word).toBe(0x00700113)
    expect(result.state).toMatchObject({ pc: count * 4, retired: 1, status: 'halted' })
    expect(result.state.registers[2]).toBe(7)
  })
  it('does not preallocate 1MiB for a short ROM and supports growth without changing old images', () => {
    const short = validateProgram([0x00500093], false)
    expect(short.byteLength).toBe(4)
    const full = validateProgram(new Uint32Array(MAX_ROM_WORDS).fill(0x00500093), false)
    expect(full.byteLength).toBe(1024 * 1024)
    expect(short.length).toBe(1)
    expect(() => new InstructionROM(new Uint32Array(MAX_ROM_WORDS + 1))).toThrow('262144')
    expect(() => parseHex('v3.0 hex words addressed\n40000: 00500093')).toThrow('容量')
  })
  it('preserves all high-address holes and keeps instruction faults distinct from successful loading', () => {
    const image = parseHex('v3.0 hex words addressed\n10000: ffffffff')
    const state = useLabStore.getState()
    state.importProgram(image.values)
    expect(useLabStore.getState().program.length).toBe(65537)
    expect(useLabStore.getState().program[65535]).toBe(0)
    expect(instructionRow(useLabStore.getState().program, 65536).instruction).toBeUndefined()
    const before = { ...initialState(), pc: 65536 * 4 }
    const result = step(before, useLabStore.getState().program)
    expect(result.state).toMatchObject({ pc: 0x40000, retired: 0, status: 'fault' })
    expect(result.state.reason).toContain('0xffffffff')
    expect(result.state.registers).toBe(before.registers)
    expect(result.state.memory).toBe(before.memory)
  })
  it('round-trips a maximum ROM plus maximum RAM within the existing JSON budget', () => {
    const project = newProject('full', new Uint32Array(MAX_ROM_WORDS).fill(0xffffffff), createMemory(new Uint8Array(262144).fill(255)))
    const restored = importProjectJSON(exportProjectJSON(project))
    expect(restored.instructionROM.length).toBe(MAX_ROM_WORDS)
    expect(restored.instructionROM[MAX_ROM_WORDS - 1]).toBe(0xffffffff)
    expect(restored.initialRAM[262143]).toBe(255)
  })
})
