/** Scene-only easing vocabulary for the chip reveal. Kept out of the shared
 * trace/UI motion tokens so the CPU presentation clock remains untouched. */

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const bezierComponent = (t: number, p1: number, p2: number) => {
  const a = 1 - 3 * p2 + 3 * p1
  const b = 3 * p2 - 6 * p1
  const c = 3 * p1
  return ((a * t + b) * t + c) * t
}

const bezierSlope = (t: number, p1: number, p2: number) => {
  const a = 1 - 3 * p2 + 3 * p1
  const b = 3 * p2 - 6 * p1
  const c = 3 * p1
  return (3 * a * t + 2 * b) * t + c
}

/** CSS-style cubic-bezier easing. Solves x(t) for the caller's normalized time
 * and returns y(t), allowing a deliberately tiny overshoot where wanted. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (value: number) => number {
  return (value: number) => {
    const x = clamp01(value)
    if (x === 0 || x === 1) return x

    let t = x
    for (let i = 0; i < 7; i += 1) {
      const error = bezierComponent(t, x1, x2) - x
      const slope = bezierSlope(t, x1, x2)
      if (Math.abs(error) < 1e-6) return bezierComponent(t, y1, y2)
      if (Math.abs(slope) < 1e-7) break
      t -= error / slope
      t = clamp01(t)
    }

    // Monotonic fallback for values near control-point cusps.
    let low = 0
    let high = 1
    for (let i = 0; i < 18; i += 1) {
      t = (low + high) / 2
      if (bezierComponent(t, x1, x2) < x) low = t
      else high = t
    }
    return bezierComponent(t, y1, y2)
  }
}

/** Soft-accelerate, long-settle curve for the mechanical reveal. The explicit
 * lead-in in CpuScene adds anticipation before this curve begins. */
export const cinematicEase = cubicBezier(.3, .4, .25, 1)

/** Camera target follows the mechanical beat and lands with a whisper of
 * elasticity; the actual camera is still damped every frame. */
export const cameraPathEase = cubicBezier(.38, .18, .2, 1.015)
