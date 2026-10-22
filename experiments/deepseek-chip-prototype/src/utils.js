export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (from, to, t) => from + (to - from) * t;

export const damp = (current, target, lambda, delta) =>
  lerp(current, target, 1 - Math.exp(-lambda * Math.max(0, delta)));

export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export const segment = (value, start, end) => smoothstep(start, end, value);

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function dampVector(vector, target, lambda, delta) {
  const alpha = 1 - Math.exp(-lambda * Math.max(0, delta));
  vector.lerp(target, alpha);
  return vector;
}
