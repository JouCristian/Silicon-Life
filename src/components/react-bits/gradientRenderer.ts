// Lifecycle adaptation of React Bits GradientASCII, copyright (c) 2026 David Haz.
// MIT + Commons Clause: third_party/react-bits/LICENSE.md. No CPU state is accessed here.
import { COMPOSITE, FIELD, VERTEX } from './gradientShaders'

interface Program { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> }

export type GradientShape = 'horizon' | 'pinch' | 'rise' | 'eclipse'

export interface GradientSettings {
  colors: string[]
  shape: GradientShape
  characters: string
  cellSize: number
  density: number
  glyphOpacity: number
  gradientOpacity: number
  depthOfField: number
  flicker: number
  softness: number
  scale: number
  flow: number
  speed: number
  grain: number
  variation: number
  intro: boolean
  fontFamily: string
  dpr?: number
}

const FPS = 20
const PIXEL_BUDGET = 1280 * 720
const INTRO_SECONDS = 2.4
const ATLAS_CELL_W = 60
const ATLAS_CELL_H = 100
const MAX_COLUMNS = 16
const SHAPES: Record<GradientShape, number> = { horizon: 0, pinch: 1, rise: 2, eclipse: 3 }
const DEFAULT_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const toLinear = (value: number) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
const toLab = ([r, g, b]: number[]) => {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b)
  const l = Math.cbrt(.4122214708 * lr + .5363325363 * lg + .0514459929 * lb)
  const m = Math.cbrt(.2119034982 * lr + .6806995451 * lg + .1073969566 * lb)
  const s = Math.cbrt(.0883024619 * lr + .2817188376 * lg + .6299787005 * lb)
  return [.2104542553 * l + .793617785 * m - .0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .808675766 * s]
}

function buildAtlas(gl: WebGL2RenderingContext, characters: string, fontFamily: string, textures: WebGLTexture[]) {
  const list = [...new Set([...characters].filter(char => char !== '\n' && char !== '\r'))]
  if (!list.length) list.push(' ')
  const columns = Math.min(MAX_COLUMNS, list.length)
  const rows = Math.ceil(list.length / columns)
  const glyphCanvas = document.createElement('canvas')
  glyphCanvas.width = ATLAS_CELL_W * columns
  glyphCanvas.height = ATLAS_CELL_H * rows
  const context = glyphCanvas.getContext('2d')
  if (!context) throw new Error('Glyph atlas unavailable')
  context.font = `300 ${Math.round(ATLAS_CELL_H * .78)}px ${fontFamily || DEFAULT_FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#fff'
  list.forEach((char, index) => {
    const column = index % columns, row = Math.floor(index / columns)
    context.fillText(char, column * ATLAS_CELL_W + ATLAS_CELL_W / 2, row * ATLAS_CELL_H + ATLAS_CELL_H / 2 + 3)
  })
  const texture = gl.createTexture()
  if (!texture) throw new Error('Glyph atlas allocation failed')
  textures.push(texture)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, glyphCanvas)
  gl.generateMipmap(gl.TEXTURE_2D)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return { texture, count: list.length, columns, rows }
}

/** Returns a disposer even if allocation, compilation or resize fails partway through. */
export function mountGradient(container: HTMLDivElement, settings: GradientSettings): () => void {
  const canvas = document.createElement('canvas')
  canvas.className = 'gradient-ascii-canvas'; canvas.setAttribute('aria-hidden', 'true')
  container.append(canvas)
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
  const shaders: WebGLShader[] = [], programs: WebGLProgram[] = [], textures: WebGLTexture[] = []
  const framebuffers: WebGLFramebuffer[] = [], arrays: WebGLVertexArrayObject[] = []
  let disposed = false, raf = 0, timer = 0, visible = true, last = 0
  let time = 0, glyphTime = 0, frameSeed = 0, introClock = settings.intro ? 0 : 1
  let resizeObserver: ResizeObserver | undefined, intersection: IntersectionObserver | undefined
  const stop = () => {
    cancelAnimationFrame(raf); raf = 0
    if (timer) { clearInterval(timer); timer = 0 }
    last = 0
  }
  function dispose() {
    if (disposed) return
    disposed = true; stop(); resizeObserver?.disconnect(); intersection?.disconnect()
    document.removeEventListener('visibilitychange', visibility)
    canvas.removeEventListener('webglcontextlost', lost)
    if (gl) {
      shaders.forEach(shader => gl.deleteShader(shader)); programs.forEach(program => gl.deleteProgram(program))
      textures.forEach(texture => gl.deleteTexture(texture)); framebuffers.forEach(framebuffer => gl.deleteFramebuffer(framebuffer))
      arrays.forEach(array => gl.deleteVertexArray(array))
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    canvas.remove(); container.dataset.state = 'fallback'
  }
  function lost(event: Event) { event.preventDefault(); dispose() }
  // Assigned before observers/listeners can invoke it.
  let wake = () => {}
  function visibility() { stop(); wake() }
  if (!gl) { dispose(); return dispose }
  const debug = gl.getExtension('WEBGL_debug_renderer_info')
  const softwareRenderer = /swiftshader|llvmpipe|software/i.test(debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : '')
  try {
    const shader = (type: number, source: string) => {
      const result = gl.createShader(type)
      if (!result) throw new Error('Shader allocation failed')
      shaders.push(result); gl.shaderSource(result, source); gl.compileShader(result)
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error('Shader compilation failed')
      return result
    }
    const link = (source: string): Program => {
      const program = gl.createProgram()
      if (!program) throw new Error('Program allocation failed')
      programs.push(program)
      gl.attachShader(program, shader(gl.VERTEX_SHADER, VERTEX)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, source))
      gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Program link failed')
      const uniforms: Program['uniforms'] = {}
      const count: number = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(program, i)
        if (info) { const name = info.name.replace(/\[0\]$/, ''); uniforms[name] = gl.getUniformLocation(program, name) }
      }
      return { program, uniforms }
    }
    const field = link(FIELD), composite = link(COMPOSITE)
    const vao = gl.createVertexArray(), framebuffer = gl.createFramebuffer()
    if (!vao || !framebuffer) {
      if (vao) arrays.push(vao)
      if (framebuffer) framebuffers.push(framebuffer)
      throw new Error('Framebuffer allocation failed')
    }
    arrays.push(vao); framebuffers.push(framebuffer)
    const texture = () => {
      const result = gl.createTexture()
      if (!result) throw new Error('Texture allocation failed')
      textures.push(result); gl.bindTexture(gl.TEXTURE_2D, result)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return result
    }
    const color = texture(), aux = texture()
    const atlas = buildAtlas(gl, settings.characters, settings.fontFamily, textures)
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
    const colorCache = new Map<string, number[]>()
    const parse = (value: string) => {
      const cached = colorCache.get(value)
      if (cached) return cached
      let rgb = [0, 0, 0]
      if (probe) {
        probe.clearRect(0, 0, 1, 1)
        probe.fillStyle = '#000000'; probe.fillStyle = value; probe.fillRect(0, 0, 1, 1)
        const [r, g, b] = probe.getImageData(0, 0, 1, 1).data
        rgb = [r / 255, g / 255, b / 255]
      }
      colorCache.set(value, rgb)
      return rgb
    }
    const palette = (settings.colors.length ? settings.colors : ['#16263e', '#4f7699', '#a9cbe6', '#d9f1ff']).slice(0, 8)
    if (palette.length < 2) palette.push(palette[0])
    const ramp = new Float32Array(24)
    palette.forEach((entry, index) => ramp.set(toLab(parse(entry)), index * 3))
    const trailData = new Float32Array(24 * 4)
    const clickData = new Float32Array(4 * 4)
    let fieldWidth = 1, fieldHeight = 1, ratio = 1
    const draw = () => {
      if (disposed) return
      gl.bindVertexArray(vao); gl.disable(gl.BLEND)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
      gl.viewport(0, 0, fieldWidth, fieldHeight); gl.useProgram(field.program)
      const u = field.uniforms
      gl.uniform1f(u.uAspect, canvas.width / canvas.height); gl.uniform1f(u.uTime, time)
      gl.uniform1i(u.uShape, SHAPES[settings.shape] ?? 0); gl.uniform3fv(u.uRamp, ramp); gl.uniform1i(u.uCount, palette.length)
      gl.uniform1f(u.uScale, settings.scale); gl.uniform1f(u.uSoftness, settings.softness); gl.uniform1f(u.uFlow, settings.flow)
      gl.uniform2f(u.uSeed, settings.variation * 3.17, settings.variation * 1.91)
      gl.uniform1f(u.uRadius, .1); gl.uniform4fv(u.uTrail, trailData); gl.uniform4fv(u.uClicks, clickData)
      gl.uniform1i(u.uClickEffect, 0); gl.uniform1f(u.uIntro, introClock); gl.uniform1f(u.uFrame, frameSeed)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(composite.program)
      const c = composite.uniforms
      ;[color, aux, atlas.texture].forEach((item, index) => { gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, item) })
      gl.uniform1i(c.uField, 0); gl.uniform1i(c.uAux, 1); gl.uniform1i(c.uAtlas, 2)
      const cellH = settings.cellSize * ratio, cellW = cellH * .6
      gl.uniform2f(c.uResolution, canvas.width, canvas.height); gl.uniform2f(c.uCell, cellW, cellH)
      gl.uniform2f(c.uOffset, (canvas.width - Math.ceil(canvas.width / cellW) * cellW) / 2, (canvas.height - Math.ceil(canvas.height / cellH) * cellH) / 2)
      gl.uniform2f(c.uAtlasGrid, atlas.columns, atlas.rows); gl.uniform1f(c.uCount, atlas.count)
      gl.uniform1f(c.uDensity, settings.density); gl.uniform1f(c.uOpacity, settings.glyphOpacity)
      gl.uniform1f(c.uFlicker, settings.flicker); gl.uniform1f(c.uDepth, settings.depthOfField)
      gl.uniform1f(c.uGlyphTime, glyphTime); gl.uniform1f(c.uSeedValue, settings.variation)
      gl.uniform1f(c.uLight, 0); gl.uniform1f(c.uGradient, settings.gradientOpacity)
      gl.uniform1f(c.uGrain, settings.grain); gl.uniform1f(c.uFrame, frameSeed)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      container.dataset.state = 'webgl'
    }
    const resize = () => {
      if (disposed) return
      try {
        const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight)
        ratio = Math.min(settings.dpr ?? window.devicePixelRatio ?? 1, 2, Math.sqrt(PIXEL_BUDGET / (width * height)))
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio))
        fieldWidth = Math.max(1, Math.round(canvas.width / 2)); fieldHeight = Math.max(1, Math.round(canvas.height / 2))
        gl.activeTexture(gl.TEXTURE0); gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        ;[color, aux].forEach((item, index) => {
          gl.bindTexture(gl.TEXTURE_2D, item)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fieldWidth, fieldHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, item, 0)
        })
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete framebuffer')
        if (visible && !document.hidden) draw()
      } catch { dispose() }
    }
    let sceneRoot: Element | null = null
    const tick = (now: number) => {
      if (disposed || !visible || document.hidden) return
      // The teaching-plane reveal owns the main thread while it runs. The
      // backdrop is behind the scene during that beat, so freeze its timer and
      // let the camera/mechanical frames keep their cadence.
      if (!sceneRoot || !sceneRoot.isConnected) sceneRoot = document.querySelector('[data-testid="scene-root"]')
      const reveal = Number(sceneRoot?.getAttribute('data-reveal') ?? 0)
      // On hardware the backdrop can keep breathing with the camera; only the
      // software path yields the main thread to the mechanical reveal.
      if (softwareRenderer && reveal > .005 && reveal < .995) return
      if (!last || now - last >= 1000 / FPS) {
        const dt = last ? clamp((now - last) / 1000, .001, .1) : 1 / 60
        last = now
        time += dt * settings.speed * .5
        glyphTime += dt * Math.max(settings.speed, .15)
        if (introClock < 1) introClock = Math.min(1, introClock + dt / INTRO_SECONDS)
        frameSeed = (frameSeed + 1) % 97
        draw()
      }
    }
    const frame = (now: number) => {
      raf = 0
      if (disposed || !visible || document.hidden) return
      tick(now)
      raf = requestAnimationFrame(frame)
    }
    // rAF is the smooth path; the 20fps timer keeps the autonomous backdrop
    // alive in software/headless compositors that can starve animation frames.
    // Both share `last`, so the combined cadence never exceeds FPS.
    wake = () => {
      if (disposed || !visible || document.hidden) return
      if (!raf) raf = requestAnimationFrame(frame)
      if (!timer) timer = window.setInterval(() => tick(performance.now()), 1000 / FPS)
    }
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container)
    intersection = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); stop(); wake() })
    intersection.observe(container)
    canvas.addEventListener('webglcontextlost', lost)
    document.addEventListener('visibilitychange', visibility)
    resize(); wake()
  } catch { dispose() }
  return dispose
}
