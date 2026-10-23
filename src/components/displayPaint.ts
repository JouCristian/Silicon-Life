import { DISPLAY_HEIGHT, DISPLAY_WIDTH, type DisplayState } from '../core/devices/logisimDisplay'

/** Paint the committed RGB888 device framebuffer into a 2D canvas. */
export function paintDisplayFrame(canvas: HTMLCanvasElement, display: DisplayState): void {
  const context = canvas.getContext('2d')
  if (!context) return
  const frame = context.createImageData(DISPLAY_WIDTH, DISPLAY_HEIGHT)
  let offset = 0
  for (const byte of display.pixels) {
    const lane = offset % 4
    frame.data[offset - lane + (lane === 0 ? 2 : lane === 2 ? 0 : lane)] = lane === 3 ? 255 : byte
    offset++
  }
  context.putImageData(frame, 0, 0)
}
