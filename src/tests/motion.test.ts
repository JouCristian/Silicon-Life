import { describe, expect, it } from 'vitest'
import { springStep } from '../motion/design'
import { PresentationClock, timelineFor } from '../motion/timeline'
import { initialState, run } from '../core/cpu'
import { encode } from '../core/isa'
import { PROGRAMS } from '../data/programs'

describe('motion uses stable time and never commits CPU state', () => {
  it('critical damping agrees at 30, 60 and 144 Hz and reverses with continuous velocity', () => {
    const values = [30, 60, 144].map(hz => {
      const state = { position: 0, velocity: 0 }
      for (let i = 0; i < hz; i++) springStep(state, 1, 1 / hz)
      return state.position
    })
    expect(values[0]).toBeCloseTo(values[1], 12)
    expect(values[1]).toBeCloseTo(values[2], 12)
    const state = { position: .5, velocity: 1 }
    springStep(state, 0, 1 / 144)
    expect(Math.abs(state.position - .5)).toBeLessThan(.01)
    expect(state.velocity).toBeGreaterThan(0) // no velocity reset on reversal
  })
  it('clock preserves a paused position, resets replays and seeks inspection to the end', () => {
    const clock = new PresentationClock()
    clock.update(1, false, true, .2, 1)
    expect(clock.elapsed).toBe(.2)
    clock.update(1, false, false, 100, 1)
    expect(clock.elapsed).toBe(.2)
    clock.update(1, false, true, .1, 1)
    expect(clock.elapsed).toBeCloseTo(.3)
    clock.update(2, false, false, 0, 1)
    expect(clock.elapsed).toBe(0)
    clock.update(3, true, false, 0, 1)
    expect(clock.read(3, true, 1)).toBe(1)
  })
  it('schedules every real transfer in causal order and preserves before/after memory', () => {
    const result = run(initialState(), PROGRAMS[1].instructions.map(encode))
    const before = result.traces[2].before.memory, after = result.state.memory
    for (const trace of result.traces) {
      for (const phase of ['fetch', 'decode', 'execute', 'memory', 'writeback'] as const) {
        const timeline = timelineFor(trace, phase)
        for (const t of timeline.transfers) {
          expect(t.value).toBe(trace.signals[t.signal])
          for (const earlier of timeline.transfers.filter(e => e.order < t.order)) expect(earlier.end).toBeLessThanOrEqual(t.start)
        }
      }
    }
    expect(before[64]).toBe(0); expect(after[64]).toBe(42)
    expect(result.state.registers[3]).toBe(42)
  })
})
