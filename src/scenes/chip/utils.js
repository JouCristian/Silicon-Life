export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export function smootherstep(low, high, value) {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
