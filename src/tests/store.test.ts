import { beforeEach, describe, expect, it } from 'vitest'
import { useLabStore } from '../stores/useLabStore'
import { DEMO_WORDS } from '../data/programs'

const store = () => useLabStore.getState()
beforeEach(() => { useLabStore.setState(useLabStore.getInitialState(), true); useLabStore.setState({ program: DEMO_WORDS }); store().reset() })

describe('trace transport is separate from architectural commit', () => {
  it('replay, stage seeking and pause never write registers again', () => {
    store().step()
    const after = store().cpu
    expect(after.retired).toBe(1)
    store().step(); expect(store().cpu).toBe(after)
    store().observe('writeback'); store().replay(0)
    for (let i = 0; i < 10; i++) store().tick()
    store().pause()
    expect(store().cpu).toBe(after)
    expect(store().history).toHaveLength(1)
  })
  it('runs to a finite end and resets architecture plus transport atomically', () => {
    store().run()
    for (let i = 0; i < 30; i++) store().tick()
    expect(store().cpu.registers[3]).toBe(12)
    expect(store().cpu.retired).toBe(3)
    expect(store().running).toBe(false)
    store().reset()
    expect(store().cpu.pc).toBe(0)
    expect(store().cpu.registers.every(v => v === 0)).toBe(true)
    expect(store().history).toHaveLength(0)
    expect(store().playing).toBe(false)
  })
  it('resumes a paused snapshot before committing the next edge', () => {
    store().run(); store().tick(); store().pause()
    const after = store().cpu
    store().run()
    expect(store().cpu).toBe(after)
    expect(store().phase).toBe('decode')
    expect(store().playing).toBe(true)
    store().tick(); store().tick(); store().tick()
    expect(store().cpu).toBe(after)
    store().tick()
    expect(store().cpu.retired).toBe(2)
  })
  it('guards continuous execution independently of program length', () => {
    useLabStore.setState({ program: Array(1002).fill(0x00100093) })
    store().setExecutionLimit(1000); store().run()
    for (let i = 0; i < 5010; i++) store().tick()
    expect(store().cpu.retired).toBe(1000)
    expect(store().running).toBe(false)
    expect(store().executionNotice).toContain('本次执行预算 1000')
    expect(store().cpu.status).toBe('ready')
  })
  it('accepts only valid initial register edits and program edits reset state', () => {
    store().setInitialRegister(1, -1)
    expect(store().cpu.registers[1]).toBe(0xffffffff)
    expect(() => store().setInitialRegister(0, 4)).toThrow()
    store().step()
    expect(() => store().setInitialRegister(1, 2)).toThrow()
    store().updateInstruction(0, { op: 'ADDI', rd: 1, rs1: 0, imm: 9 })
    expect(store().history).toHaveLength(0)
    expect(store().cpu.retired).toBe(0)
    store().run(); for (let i = 0; i < 20; i++) store().tick()
    expect(store().cpu.registers[3]).toBe(16)
  })
})
