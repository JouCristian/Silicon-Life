export const INTERIOR_WIDTH = 7.9
export const INTERIOR_HEIGHT = 5.2
/** Fit against the real clipped viewport, not the full persistent Canvas. */
export function explorationDistance(scale: number, viewportWidth: number, viewportHeight: number, canvasHeight: number) {
  return scale * Math.max(INTERIOR_WIDTH * canvasHeight / Math.max(1, viewportWidth), INTERIOR_HEIGHT * canvasHeight / Math.max(1, viewportHeight)) / (2 * Math.tan(40 * Math.PI / 360))
}
