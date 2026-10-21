import { PHASES, type ExecutionTrace, type Phase } from '../core/trace/types'
import { timelineFor, type ScheduledTransfer } from './timeline'

export type TransferPlayback = { readonly mode: 'auto' } | {
  readonly mode: 'transfer'; readonly index: number; readonly complete: boolean
}
export const AUTO_PLAYBACK: TransferPlayback = Object.freeze({ mode: 'auto' })
export const PLAYBACK_RATES = [.25, .5, .75, 1, 1.5, 2] as const
export interface TransferStep {
  readonly phase: Phase; readonly start: number; readonly end: number
  readonly transfers: readonly ScheduledTransfer[]
}
const cache = new WeakMap<ExecutionTrace, readonly TransferStep[]>()

/** Parallel signals in a causal group are one observation, never extra CPU clocks. */
export function transferSteps(trace: ExecutionTrace | undefined): readonly TransferStep[] {
  if (!trace) return []
  const cached = cache.get(trace)
  if (cached) return cached
  const steps = PHASES.flatMap(phase => {
    const { transfers } = timelineFor(trace, phase)
    return [...new Set(transfers.map(t => t.order))].map(order => {
      const group = transfers.filter(t => t.order === order)
      return { phase, transfers: group, start: Math.min(...group.map(t => t.start)), end: Math.max(...group.map(t => t.end)) + .32 }
    })
  })
  cache.set(trace, steps)
  return steps
}
