import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'
import type { ModuleId } from '../../core/trace/types'

const CODES: Record<ModuleId, string> = {
  pc: 'PC', imem: 'IMEM', decoder: 'DEC', regfile: 'RF', imm: 'IMM',
  mux: 'MUX', alu: 'ALU', wb: 'WB', dmem: 'DMEM', branch: 'BR', nextpc: 'NPC',
}

/**
 * Printed top face for one teaching-plane block. This is a silkscreen layer,
 * not a second UI: labels, values and pointer interaction remain in the shared
 * HTML portal. The alpha texture lets the PBR housing reflect through.
 */
export function createModuleFaceTexture(id: ModuleId, index: number): CanvasTexture {
  const width = 512
  const height = 256
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建模块面板纹理')

  ctx.clearRect(0, 0, width, height)

  // An inset graphite face with a subtle edge gradient. The alpha keeps the
  // rounded body readable around the perimeter.
  const wash = ctx.createLinearGradient(0, 0, width, height)
  wash.addColorStop(0, 'rgba(31, 53, 66, .78)')
  wash.addColorStop(.48, 'rgba(8, 17, 23, .72)')
  wash.addColorStop(1, 'rgba(22, 41, 52, .8)')
  ctx.fillStyle = wash
  ctx.fillRect(12, 12, width - 24, height - 24)

  ctx.strokeStyle = 'rgba(215, 235, 242, .6)'
  ctx.lineWidth = 2.4
  ctx.strokeRect(14, 14, width - 28, height - 28)

  ctx.strokeStyle = 'rgba(143, 190, 212, .34)'
  ctx.lineWidth = 1.2
  ctx.strokeRect(24, 24, width - 48, height - 48)

  // Etched circuit motif.
  ctx.strokeStyle = 'rgba(163, 212, 235, .52)'
  ctx.lineWidth = 2.4
  const trace = (points: [number, number][]) => {
    ctx.beginPath()
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))
    ctx.stroke()
  }
  trace([[30, height - 44], [104, height - 44], [104, height - 82], [168, height - 82]])
  trace([[width - 30, height - 44], [width - 104, height - 44], [width - 104, height - 82], [width - 168, height - 82]])
  trace([[30, 44], [92, 44], [92, 74], [142, 74]])
  trace([[width - 30, 44], [width - 92, 44], [width - 92, 74], [width - 142, 74]])

  // Small die and contact pads. Kept off the exact center so the module label
  // remains readable above it.
  ctx.fillStyle = 'rgba(3, 8, 11, .92)'
  ctx.strokeStyle = 'rgba(183, 221, 236, .6)'
  ctx.lineWidth = 2.4
  ctx.fillRect(width / 2 - 64, height / 2 - 26, 128, 52)
  ctx.strokeRect(width / 2 - 64, height / 2 - 26, 128, 52)
  ctx.strokeStyle = 'rgba(164, 214, 238, .42)'
  for (let i = 0; i < 7; i++) {
    ctx.beginPath()
    ctx.moveTo(width / 2 - 52 + i * 16, height / 2 - 34)
    ctx.lineTo(width / 2 - 52 + i * 16, height / 2 - 26)
    ctx.moveTo(width / 2 - 52 + i * 16, height / 2 + 26)
    ctx.lineTo(width / 2 - 52 + i * 16, height / 2 + 34)
    ctx.stroke()
  }

  // Code, batch mark and a restrained signal tick. The HTML label carries the
  // full localized name, so the printed mark stays in the industrial register.
  ctx.fillStyle = 'rgba(231, 244, 248, .88)'
  ctx.font = '600 28px Consolas, monospace'
  ctx.textAlign = 'left'
  ctx.fillText(CODES[id], 32, 62)
  ctx.fillStyle = 'rgba(162, 203, 218, .78)'
  ctx.font = '500 17px Consolas, monospace'
  ctx.fillText(`U${String(index + 1).padStart(2, '0')} / RV32I`, 32, 88)

  ctx.fillStyle = 'rgba(166, 219, 243, .94)'
  ctx.fillRect(width - 56, height - 48, 24, 4)
  ctx.fillStyle = 'rgba(143, 184, 199, .7)'
  ctx.font = '500 14px Consolas, monospace'
  ctx.textAlign = 'right'
  ctx.fillText('SL', width - 32, 62)

  // Registration ticks.
  ctx.strokeStyle = 'rgba(198, 224, 232, .4)'
  ctx.lineWidth = 2
  for (const [x, y, sx, sy] of [[20, 20, 1, 1], [width - 20, 20, -1, 1], [20, height - 20, 1, -1], [width - 20, height - 20, -1, -1]]) {
    ctx.beginPath()
    ctx.moveTo(x + 12 * sx, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + 12 * sy)
    ctx.stroke()
  }

  const texture = new CanvasTexture(canvas)
  texture.name = `TeachingModuleV3-${id}`
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter
  texture.magFilter = LinearFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
