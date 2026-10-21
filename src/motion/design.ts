/** Shared motion vocabulary. Seconds throughout, including the analytic spring. */
export const MOTION = {
  spring: { type: 'spring', stiffness: 190, damping: 29, mass: 1 } as const,
  ease: [.22, 1, .36, 1] as const,
  ui: { enter: .32, exit: .18, stagger: .065 },
  revealOmega: 8,
  anchorOmega: 9,
  cameraResponse: 6,
  orbitDamping: 6,
  flow: { lead: .09, tail: .4, min: .3, max: .95, speed: 23, idle: .22, reduced: .08 },
  color: { data: '#a3ccff', control: '#d7bb92', writeback: '#94d7c4', inactive: '#435060' },
} as const

export interface SpringState { position: number; velocity: number }
/** Exact solution of a critically damped spring for a constant target over dt. */
export function springStep(state: SpringState, target: number, dt: number, omega: number = MOTION.revealOmega): void {
  const offset = state.position - target
  const c = state.velocity + omega * offset
  const decay = Math.exp(-omega * Math.max(0, dt))
  state.position = target + (offset + c * dt) * decay
  state.velocity = (state.velocity - omega * c * dt) * decay
}
export const smoothstep = (low: number, high: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)))
  return t * t * (3 - 2 * t)
}
