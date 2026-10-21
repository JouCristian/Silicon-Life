import type { ExecutionTrace, Phase, TraceTransfer } from '../core/trace/types'
import { WIRES, type Point } from '../scenes/topology'
import { MOTION } from './design'

export function pathLength(points: readonly Point[]) {
  return points.slice(1).reduce((total, point, i) => total + Math.hypot(...point.map((n, axis) => n - points[i][axis])), 0)
}

export interface ScheduledTransfer extends TraceTransfer { readonly start: number; readonly end: number }
export interface Timeline { readonly transfers: readonly ScheduledTransfer[]; readonly duration: number }
const cache = new WeakMap<ExecutionTrace, Partial<Record<Phase, Timeline>>>()

/** Geometry changes travel duration only, never architectural results or transfer order. */
export function timelineFor(trace: ExecutionTrace | undefined, phase: Phase): Timeline {
  if (!trace) return { transfers: [], duration: MOTION.flow.idle }
  let phases = cache.get(trace)
  if (!phases) { phases = {}; cache.set(trace, phases) }
  if (phases[phase]) return phases[phase]!
  const source = trace.transfers.filter(t => t.phase === phase)
  const transfers: ScheduledTransfer[] = []
  let time = MOTION.flow.lead as number
  for (const order of [...new Set(source.map(t => t.order))].sort((a, b) => a - b)) {
    const group = source.filter(t => t.order === order).map(t => {
      const wire = WIRES.find(w => w.id === t.id)
      if (!wire) throw new Error(`Trace route has no geometry: ${t.id}`)
      const duration = Math.min(MOTION.flow.max, Math.max(MOTION.flow.min, pathLength(wire.points) / MOTION.flow.speed))
      return Object.freeze({ ...t, start: time, end: time + duration })
    })
    transfers.push(...group)
    time = Math.max(time, ...group.map(t => t.end)) + .035
  }
  return phases[phase] = Object.freeze({ transfers: Object.freeze(transfers), duration: source.length ? time + MOTION.flow.tail : MOTION.flow.idle })
}

export class PresentationClock {
  epoch = -1
  elapsed = 0
  update(epoch: number, inspection: boolean, playing: boolean, dt: number, duration: number): boolean {
    if (this.epoch !== epoch) { this.epoch = epoch; this.elapsed = inspection ? duration : 0 }
    if (playing) this.elapsed = Math.min(duration, this.elapsed + Math.max(0, dt))
    return playing && this.elapsed >= duration
  }
  read(epoch: number, inspection: boolean, duration: number) {
    return inspection ? duration : this.epoch === epoch ? Math.min(duration, this.elapsed) : 0
  }
}
export const presentationClock = new PresentationClock()
