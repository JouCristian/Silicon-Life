import { beforeEach, describe, expect, it } from 'vitest'
import { useLabStore } from '../stores/useLabStore'
import { presentationClock, PresentationClock, timelineFor } from '../motion/timeline'
import { transferSteps } from '../motion/transferPlayback'
import { PHASES } from '../core/trace/types'

const store = () => useLabStore.getState()
function finishTransfer() {
  const s = store(), steps = transferSteps(s.history[s.traceIndex])
  if (s.transferPlayback.mode !== 'transfer') throw Error('expected transfer mode')
  presentationClock.update(s.playbackEpoch, false, true, 100, steps[s.transferPlayback.index].end)
  store().tick()
}
beforeEach(() => { store().loadProgram('memory'); store().setPlaybackRate(.5) })

describe('presentation transfer playback leaves architectural state untouched', () => {
  it('uses real groups, skips empty phases, and stops at exactly one group', () => {
    store().step(); store().observe('fetch')
    const trace = store().history[0], after = store().cpu
    const steps = transferSteps(trace)
    expect(steps.some(t => t.phase === 'memory')).toBe(false)
    expect(steps.flatMap(t => t.transfers).map(t => t.id).sort()).toEqual(trace.transfers.map(t => t.id).sort())
    for (let index = 0; index < steps.length; index++) {
      store().stepTransfer()
      expect(store().transferPlayback).toEqual({ mode: 'transfer', index, complete: false })
      store().stepTransfer() // repeated input while playing cannot skip an event
      expect(store().transferPlayback).toHaveProperty('index', index)
      finishTransfer()
      expect(store().playing).toBe(false)
      expect(store().cpu).toBe(after)
      expect(store().cpu.memory).toBe(after.memory)
      const next = steps[index + 1]
      if (next?.phase === steps[index].phase) expect(presentationClock.elapsed).toBeLessThan(next.start)
    }
    expect(store().transferPlayback).toHaveProperty('complete', true)
    store().stepTransfer(); expect(store().cpu.retired).toBe(1)
    expect(store().history).toHaveLength(1)
  })
  it('freezes mid-transfer, resumes to its boundary and resets for another trace', () => {
    store().step(); store().observe('decode'); store().stepTransfer()
    let s = store()
    const event = transferSteps(s.history[0]).find(t => t.phase === 'decode')!
    presentationClock.update(s.playbackEpoch, false, true, .1, event.end, .5)
    const time = presentationClock.elapsed, after = s.cpu
    store().pause(); store().setPlaybackRate(2)
    s = store(); presentationClock.update(s.playbackEpoch, false, s.playing, 100, event.end, s.playbackRate)
    expect(presentationClock.elapsed).toBe(time)
    store().resumePlayback(); finishTransfer()
    expect(store().cpu).toBe(after)
    store().observe('memory'); store().stepTransfer()
    expect(store().phase).toBe('writeback') // empty arithmetic memory stage skipped
    store().replay(0); expect(store().transferPlayback.mode).toBe('auto')
    store().observe('writeback'); store().step()
    expect(store().transferPlayback.mode).toBe('auto')
    expect(store().phase).toBe('fetch')
    expect(store().cpu.retired).toBe(2)
  })
  it('replays store and branch transfers without duplicating any architectural edge', () => {
    for (const id of ['memory', 'branch']) {
      store().loadProgram(id); store().run()
      for (let i = 0; i < 50; i++) store().tick()
      const after = store().cpu
      store().replay(2); store().observe('fetch')
      const count = transferSteps(store().history[2]).length
      for (let i = 0; i < count; i++) { store().stepTransfer(); finishTransfer() }
      expect(store().cpu).toBe(after)
      expect(store().cpu.registers[3]).toBe(42)
      expect(store().cpu.retired).toBe(4)
    }
  })
  it('seeks every phase and completes transfer mode before returning to auto run', () => {
    store().step()
    for (const phase of PHASES) {
      store().observe(phase); expect(store().transferPlayback.mode).toBe('auto')
      store().stepTransfer(); expect(store().cpu.retired).toBe(1)
    }
    store().pause(); store().run()
    for (let i = 0; i < 50; i++) store().tick()
    expect(store().cpu.registers[3]).toBe(42)
    expect(store().cpu.retired).toBe(4)
  })
  it('changes only the clock rate, preserves cached schedules, and rejects invalid rates', () => {
    store().step(); const trace = store().history[0]
    const timeline = timelineFor(trace, 'fetch'), before = store().cpu
    for (const rate of [.25, .5, .75, 1, 1.5, 2]) {
      store().setPlaybackRate(rate); expect(store().playbackRate).toBe(rate)
      expect(timelineFor(trace, 'fetch')).toBe(timeline)
    }
    for (const rate of [0, -1, Infinity, NaN, 3]) store().setPlaybackRate(rate)
    expect(store().playbackRate).toBe(2)
    expect(store().cpu).toBe(before)
    const clock = new PresentationClock()
    clock.update(1, false, true, .4, 10, .5)
    const position = clock.elapsed
    clock.update(1, false, true, 0, 10, 2); expect(clock.elapsed).toBe(position)
    clock.update(1, false, true, .1, 10, 2); expect(clock.elapsed).toBeCloseTo(.4)
    clock.update(1, false, false, 200, 10, 2); expect(clock.elapsed).toBeCloseTo(.4)
  })
})
