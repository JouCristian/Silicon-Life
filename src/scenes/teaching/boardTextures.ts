import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace } from 'three'
import { MODULES, POSITIONS, WIRES } from '../topology'

const WIDTH = 16.3
const HEIGHT = 10.2
const TEXTURE_WIDTH = 1536
const TEXTURE_HEIGHT = 960

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function toCanvas(x: number, y: number): [number, number] {
  return [((x + WIDTH / 2) / WIDTH) * TEXTURE_WIDTH, ((HEIGHT / 2 - y) / HEIGHT) * TEXTURE_HEIGHT]
}

function line(ctx: CanvasRenderingContext2D, points: [number, number, number][]) {
  ctx.beginPath()
  points.forEach(([x, y], index) => {
    const [px, py] = toCanvas(x, y)
    if (index === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  ctx.stroke()
}

function makeTexture(canvas: HTMLCanvasElement, name: string, colorSpace = SRGBColorSpace): CanvasTexture {
  const texture = new CanvasTexture(canvas)
  texture.name = name
  texture.colorSpace = colorSpace
  texture.anisotropy = 8
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.needsUpdate = true
  return texture
}

function seeded(seed: number) {
  let value = seed >>> 0
  return () => {
    value |= 0
    value = (value + 0x6d2b79f5) | 0
    let n = Math.imul(value ^ (value >>> 15), 1 | value)
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Draws the physical teaching board beneath the live topology. The board is a
 * texture rather than a crowd of decorative meshes: it adds copper, substrate
 * grain, component footprints and engineering marks without spending another
 * draw call or changing the module/wire layout.
 */
export function createBoardTextures(): { map: CanvasTexture; dispose: () => void } {
  const canvas = document.createElement('canvas')
  canvas.width = TEXTURE_WIDTH
  canvas.height = TEXTURE_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建教学电路板纹理')

  const random = seeded(0x51_4c_2d_33)

  // Deep graphite PCB with a cold center and a nearly black edge. The radial
  // wash keeps the densely printed board from turning into a flat swatch.
  ctx.fillStyle = '#04080c'
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)
  const wash = ctx.createRadialGradient(TEXTURE_WIDTH * .48, TEXTURE_HEIGHT * .48, 40, TEXTURE_WIDTH * .48, TEXTURE_HEIGHT * .48, TEXTURE_WIDTH * .68)
  wash.addColorStop(0, '#132533')
  wash.addColorStop(.38, '#091923')
  wash.addColorStop(.76, '#050f16')
  wash.addColorStop(1, '#010406')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)

  // PCB weave. The major divisions are intentionally visible at the teaching
  // scale; the minor rules only add tooth to the surface.
  for (let x = 0; x <= TEXTURE_WIDTH; x += 32) {
    const major = x % 256 === 0
    ctx.strokeStyle = major ? 'rgba(128, 181, 203, .13)' : 'rgba(102, 146, 164, .052)'
    ctx.lineWidth = major ? 1.8 : 1
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, TEXTURE_HEIGHT); ctx.stroke()
  }
  for (let y = 0; y <= TEXTURE_HEIGHT; y += 32) {
    const major = y % 256 === 0
    ctx.strokeStyle = major ? 'rgba(128, 181, 203, .11)' : 'rgba(102, 146, 164, .05)'
    ctx.lineWidth = major ? 1.8 : 1
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(TEXTURE_WIDTH, y); ctx.stroke()
  }

  // Fine machining / laminate grain, intentionally too low-contrast to read as
  // noise at normal viewing size.
  ctx.lineWidth = 1
  for (let i = 0; i < 74; i++) {
    const y = random() * TEXTURE_HEIGHT
    ctx.strokeStyle = `rgba(${120 + random() * 50}, ${150 + random() * 40}, ${165 + random() * 30}, ${.022 + random() * .03})`
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(TEXTURE_WIDTH, y + (random() - .5) * 18)
    ctx.stroke()
  }

  // Copper field. The orthogonal traces echo the teaching topology instead of
  // pretending to be a second, decorative data path.
  for (const wire of WIRES) {
    const points = wire.points.map(([x, y]) => [x, y, 0] as [number, number, number])
    ctx.lineCap = 'square'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(2, 5, 7, .98)'
    ctx.lineWidth = wire.control ? 23 : 20
    line(ctx, points)
    ctx.strokeStyle = wire.control ? 'rgba(190, 155, 107, .12)' : 'rgba(132, 193, 222, .11)'
    ctx.lineWidth = 14
    line(ctx, points)
    ctx.strokeStyle = wire.control ? 'rgba(191, 157, 107, .62)' : 'rgba(134, 190, 216, .58)'
    ctx.lineWidth = wire.control ? 6.5 : 7.4
    line(ctx, points)
    ctx.strokeStyle = wire.control ? 'rgba(243, 208, 149, .25)' : 'rgba(198, 235, 249, .26)'
    ctx.lineWidth = 1.7
    line(ctx, points)
    for (const [x, y] of points) {
      const [px, py] = toCanvas(x, y)
      ctx.fillStyle = wire.control ? 'rgba(218, 184, 126, .56)' : 'rgba(155, 211, 232, .5)'
      ctx.beginPath()
      ctx.arc(px, py, wire.control ? 7 : 8.2, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = 'rgba(2, 9, 12, .9)'
      ctx.beginPath()
      ctx.arc(px, py, 2.7, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Deterministic fine copper fan-out around the board perimeter. It never
  // crosses the authored module footprints, so it cannot imply a route change.
  const moduleBounds = MODULES.map(module => {
    const [x, y] = POSITIONS[module.id]
    return { x, y, halfW: module.width / 2 + .45, halfH: .72 }
  })
  const avoidsModules = (x: number, y: number) => moduleBounds.every(box => Math.abs(x - box.x) > box.halfW || Math.abs(y - box.y) > box.halfH)
  ctx.lineCap = 'square'
  for (let i = 0; i < 58; i++) {
    let x = -7.7 + random() * 15.4
    let y = (random() < .5 ? -1 : 1) * (3.75 + random() * .95)
    if (!avoidsModules(x, y)) continue
    const points: [number, number, number][] = [[x, y, 0]]
    const steps = 2 + Math.floor(random() * 4)
    for (let step = 0; step < steps; step++) {
      if (random() < .5) x += (random() - .5) * 1.5
      else y += (random() - .5) * .9
      x = Math.max(-7.75, Math.min(7.75, x))
      y = Math.max(-4.8, Math.min(4.8, y))
      if (!avoidsModules(x, y)) break
      points.push([x, y, 0])
    }
    if (points.length < 2) continue
    ctx.strokeStyle = `rgba(112, 158, 178, ${.13 + random() * .12})`
    ctx.lineWidth = 1.4 + random() * 1.8
    line(ctx, points)
    if (random() > .55) {
      const [px, py] = toCanvas(points.at(-1)![0], points.at(-1)![1])
      ctx.fillStyle = 'rgba(150, 195, 211, .35)'
      ctx.beginPath()
      ctx.arc(px, py, 3.4 + random() * 2.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // Plated via field in the unused routing channels.
  for (let i = 0; i < 110; i++) {
    const x = -7.45 + random() * 14.9
    const y = -4.55 + random() * 9.1
    if (!avoidsModules(x, y)) continue
    const [px, py] = toCanvas(x, y)
    ctx.strokeStyle = `rgba(126, 173, 190, ${.12 + random() * .1})`
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.arc(px, py, 4 + random() * 2.2, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(1, 4, 6, .85)'
    ctx.beginPath(); ctx.arc(px, py, 2.1, 0, Math.PI * 2); ctx.fill()
  }

  // Diagonal copper hatch in the quiet corner fields. It suggests a ground pour
  // and gives the eye a fine, non-semantic texture away from the live routes.
  for (const [x0, y0, x1, y1] of [
    [-7.7, 2.9, -5.2, 4.55], [4.5, 2.7, 7.55, 4.5],
    [-7.7, -4.55, -5.1, -3.05], [4.35, -4.55, 7.55, -2.1],
  ]) {
    const [cx0, cy0] = toCanvas(x0, y1)
    const [cx1, cy1] = toCanvas(x1, y0)
    ctx.save()
    ctx.beginPath()
    ctx.rect(cx0, cy0, cx1 - cx0, cy1 - cy0)
    ctx.clip()
    ctx.strokeStyle = 'rgba(151, 128, 90, .14)'
    ctx.lineWidth = 1.2
    for (let d = -cy1; d < TEXTURE_WIDTH; d += 18) {
      ctx.beginPath()
      ctx.moveTo(d, cy0)
      ctx.lineTo(d + (cy1 - cy0), cy1)
      ctx.stroke()
    }
    ctx.restore()
    ctx.strokeStyle = 'rgba(111, 157, 176, .18)'
    ctx.lineWidth = 1
    ctx.strokeRect(cx0, cy0, cx1 - cx0, cy1 - cy0)
  }

  // Module landing pads / keep-out fields. These sit under the live HTML labels
  // and 3D blocks, giving the board a believable assembly depth.
  for (let i = 0; i < MODULES.length; i++) {
    const module = MODULES[i]
    const [x, y] = POSITIONS[module.id]
    const [px, py] = toCanvas(x, y)
    const padW = (module.width + .7) / WIDTH * TEXTURE_WIDTH
    const padH = 1.35 / HEIGHT * TEXTURE_HEIGHT
    ctx.save()
    ctx.shadowColor = 'rgba(0, 0, 0, .8)'
    ctx.shadowBlur = 28
    ctx.shadowOffsetY = 8
    ctx.fillStyle = 'rgba(2, 5, 7, .88)'
    roundedRect(ctx, px - padW / 2, py - padH / 2, padW, padH, 9)
    ctx.fill()
    ctx.restore()
    const padWash = ctx.createLinearGradient(px - padW / 2, py - padH / 2, px + padW / 2, py + padH / 2)
    padWash.addColorStop(0, 'rgba(81, 128, 148, .1)')
    padWash.addColorStop(.55, 'rgba(21, 48, 61, .18)')
    padWash.addColorStop(1, 'rgba(119, 160, 172, .06)')
    ctx.fillStyle = padWash
    roundedRect(ctx, px - padW / 2 + 3, py - padH / 2 + 3, padW - 6, padH - 6, 7)
    ctx.fill()
    ctx.strokeStyle = 'rgba(126, 172, 191, .42)'
    ctx.lineWidth = 1.7
    roundedRect(ctx, px - padW / 2 + 4, py - padH / 2 + 4, padW - 8, padH - 8, 7)
    ctx.stroke()
    // Tiny corner registration ticks and mounting pads.
    ctx.strokeStyle = 'rgba(195, 222, 230, .36)'
    ctx.lineWidth = 1.4
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const cx = px + sx * (padW / 2 - 7)
      const cy = py + sy * (padH / 2 - 7)
      ctx.beginPath()
      ctx.moveTo(cx, cy - sy * 10)
      ctx.lineTo(cx, cy)
      ctx.lineTo(cx - sx * 10, cy)
      ctx.stroke()
      ctx.fillStyle = 'rgba(190, 207, 203, .22)'
      ctx.beginPath(); ctx.arc(cx, cy, 2.4, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = 'rgba(195, 221, 231, .55)'
    ctx.font = '600 18px Consolas, monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`U${String(i + 1).padStart(2, '0')}`, px - padW / 2 + 12, py + padH / 2 - 13)
  }

  // A small population of passives and edge connectors. Everything is drawn
  // into the same map, so the final board still renders in a single batch.
  for (let i = 0; i < 92; i++) {
    const x = -7.6 + random() * 15.2
    const y = -4.7 + random() * 9.4
    if (!avoidsModules(x, y)) continue
    const [px, py] = toCanvas(x, y)
    const horizontal = random() > .5
    const w = horizontal ? 25 + random() * 35 : 11 + random() * 8
    const h = horizontal ? 11 + random() * 8 : 25 + random() * 35
    ctx.save()
    ctx.translate(px, py)
    ctx.fillStyle = random() > .5 ? 'rgba(10, 16, 20, .92)' : 'rgba(24, 31, 36, .92)'
    ctx.strokeStyle = 'rgba(167, 187, 190, .16)'
    ctx.lineWidth = 1.2
    ctx.fillRect(-w / 2, -h / 2, w, h)
    ctx.strokeRect(-w / 2, -h / 2, w, h)
    if (random() > .45) {
      ctx.fillStyle = 'rgba(149, 170, 172, .18)'
      ctx.fillRect(-w / 2 + 3, -h / 2 + 3, Math.max(3, w * .2), Math.max(3, h * .2))
    }
    ctx.restore()
  }

  // Mounting bosses and a continuous copper perimeter bus. These frames give
  // the large board edge a finished product silhouette rather than a floating
  // rectangle.
  for (const [x, y] of [[-7.7, -4.7], [7.7, -4.7], [-7.7, 4.7], [7.7, 4.7]]) {
    const [px, py] = toCanvas(x, y)
    ctx.fillStyle = 'rgba(1, 3, 4, .9)'
    ctx.beginPath(); ctx.arc(px, py, 30, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = 'rgba(181, 207, 214, .4)'
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(px, py, 28, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = 'rgba(95, 139, 157, .38)'
    ctx.lineWidth = 8
    ctx.beginPath(); ctx.arc(px, py, 17, 0, Math.PI * 2); ctx.stroke()
    ctx.fillStyle = 'rgba(3, 6, 8, 1)'
    ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2); ctx.fill()
  }

  ctx.strokeStyle = 'rgba(164, 136, 96, .24)'
  ctx.lineWidth = 7
  roundedRect(ctx, 52, 52, TEXTURE_WIDTH - 104, TEXTURE_HEIGHT - 104, 15)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(123, 173, 195, .24)'
  ctx.lineWidth = 2
  roundedRect(ctx, 66, 66, TEXTURE_WIDTH - 132, TEXTURE_HEIGHT - 132, 12)
  ctx.stroke()

  // Edge fingers: a restrained copper contact row, not a bright decoration.
  ctx.fillStyle = 'rgba(182, 157, 112, .4)'
  for (let i = 0; i < 26; i++) {
    const x = 96 + i * 52
    ctx.fillRect(x, TEXTURE_HEIGHT - 58, 22, 20)
    ctx.fillRect(x, 38, 22, 12)
  }
  ctx.fillStyle = 'rgba(146, 196, 215, .22)'
  for (let i = 0; i < 5; i++) {
    ctx.fillRect(120 + i * 250, TEXTURE_HEIGHT - 86, 160, 3)
    ctx.fillRect(120 + i * 250, 80, 160, 3)
  }

  // Engineering marks and border. Keep type small enough to feel printed, but
  // large enough to survive the board's ~0.5 scale on screen.
  ctx.strokeStyle = 'rgba(126, 161, 174, .36)'
  ctx.lineWidth = 3
  roundedRect(ctx, 18, 18, TEXTURE_WIDTH - 36, TEXTURE_HEIGHT - 36, 22)
  ctx.stroke()
  ctx.strokeStyle = 'rgba(65, 96, 109, .32)'
  ctx.lineWidth = 1.4
  roundedRect(ctx, 30, 30, TEXTURE_WIDTH - 60, TEXTURE_HEIGHT - 60, 16)
  ctx.stroke()

  ctx.fillStyle = 'rgba(194, 217, 222, .6)'
  ctx.font = '600 38px Bahnschrift, "DIN Alternate", Consolas, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('SL / RV32I', 58, 88)
  ctx.fillStyle = 'rgba(135, 168, 178, .5)'
  ctx.font = '500 22px Consolas, monospace'
  ctx.fillText('SINGLE-CYCLE DATAPATH  ·  REV.A', 58, 120)

  ctx.textAlign = 'right'
  ctx.fillStyle = 'rgba(168, 194, 202, .42)'
  ctx.font = '500 20px Consolas, monospace'
  ctx.fillText('SILICON LIFE / 2026', TEXTURE_WIDTH - 58, 86)
  ctx.fillStyle = 'rgba(121, 153, 165, .36)'
  ctx.fillText('BOARD SL-DT-03  ·  16.3 × 10.2', TEXTURE_WIDTH - 58, 116)

  // Registration crosses and a tiny coordinate motif anchor the corners.
  ctx.strokeStyle = 'rgba(177, 203, 210, .34)'
  ctx.lineWidth = 1.5
  for (const [x, y] of [[54, TEXTURE_HEIGHT - 54], [TEXTURE_WIDTH - 54, TEXTURE_HEIGHT - 54], [TEXTURE_WIDTH - 54, 54]]) {
    ctx.beginPath()
    ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y)
    ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10)
    ctx.stroke()
  }

  // Vignette keeps the live module field bright and the outer board quiet.
  const vignette = ctx.createRadialGradient(TEXTURE_WIDTH * .5, TEXTURE_HEIGHT * .5, TEXTURE_WIDTH * .18, TEXTURE_WIDTH * .5, TEXTURE_HEIGHT * .5, TEXTURE_WIDTH * .68)
  vignette.addColorStop(0, 'rgba(0,0,0,0)')
  vignette.addColorStop(.75, 'rgba(0,0,0,.1)')
  vignette.addColorStop(1, 'rgba(0,0,0,.52)')
  ctx.fillStyle = vignette
  ctx.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT)

  const map = makeTexture(canvas, 'TeachingBoardV3Albedo')
  return {
    map,
    dispose: () => map.dispose(),
  }
}
