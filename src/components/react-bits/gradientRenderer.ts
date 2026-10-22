// Lifecycle adaptation of React Bits GradientASCII, copyright (c) 2026 David Haz.
// MIT + Commons Clause: third_party/react-bits/LICENSE.md. No CPU state is accessed here.
import { COMPOSITE, FIELD, VERTEX } from './gradientShaders'

interface Program { program: WebGLProgram; uniforms: Record<string, WebGLUniformLocation | null> }
const FPS = 20
const PIXEL_BUDGET = 1280 * 720

/** Returns a disposer even if allocation, compilation or resize fails partway through. */
export function mountGradient(container: HTMLDivElement): () => void {
  const canvas = document.createElement('canvas')
  canvas.className = 'gradient-ascii-canvas'; canvas.setAttribute('aria-hidden', 'true')
  container.append(canvas)
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
  const shaders: WebGLShader[] = [], programs: WebGLProgram[] = [], textures: WebGLTexture[] = []
  const framebuffers: WebGLFramebuffer[] = [], arrays: WebGLVertexArrayObject[] = []
  let disposed = false, raf = 0, visible = true, last = 0, time = 0
  let resizeObserver: ResizeObserver | undefined, intersection: IntersectionObserver | undefined
  const stop = () => { cancelAnimationFrame(raf); raf = 0; last = 0 }
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
    if (!vao || !framebuffer) { if (vao) arrays.push(vao); if (framebuffer) framebuffers.push(framebuffer); throw new Error('Framebuffer allocation failed') }
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
    const color = texture(), aux = texture(), atlas = texture()
    // Original glyph-atlas proportions and coordinate mapping; local system font only.
    const glyphCanvas = document.createElement('canvas'), characters = ' 01+=×'
    glyphCanvas.width = 60 * characters.length; glyphCanvas.height = 100
    const context = glyphCanvas.getContext('2d')
    if (!context) throw new Error('Glyph atlas unavailable')
    context.font = '300 78px Consolas, monospace'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#fff'
    Array.from(characters).forEach((char, i) => context.fillText(char, i * 60 + 30, 53))
    gl.bindTexture(gl.TEXTURE_2D, atlas); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, glyphCanvas)
    gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    const toLinear = (v: number) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4
    const toLab = (rgb: number[]) => {
      const [r, g, b] = rgb.map(n => toLinear(n / 255))
      const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b)
      const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b)
      const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b)
      return [.2104542553 * l + .793617785 * m - .0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s]
    }
    const ramp = new Float32Array(24)
    ;[[38, 52, 73], [74, 98, 129], [114, 137, 164]].forEach((rgb, i) => ramp.set(toLab(rgb), i * 3))
    let fieldWidth = 1, fieldHeight = 1, ratio = 1
    const draw = () => {
      if (disposed) return
      gl.bindVertexArray(vao); gl.disable(gl.BLEND)
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer); gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
      gl.viewport(0, 0, fieldWidth, fieldHeight); gl.useProgram(field.program)
      const u = field.uniforms
      gl.uniform1f(u.uAspect, canvas.width / canvas.height); gl.uniform1f(u.uTime, time)
      gl.uniform1i(u.uShape, 0); gl.uniform3fv(u.uRamp, ramp); gl.uniform1i(u.uCount, 3)
      gl.uniform1f(u.uScale, 1.1); gl.uniform1f(u.uSoftness, .65); gl.uniform1f(u.uFlow, .3)
      gl.uniform2f(u.uSeed, 0, 0); gl.uniform1f(u.uRadius, .1); gl.uniform1f(u.uIntro, 1)
      gl.uniform1f(u.uFrame, 0); gl.uniform1i(u.uClickEffect, 0)
      // Trail/click uniforms remain zero; no pointer listeners are registered.
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(composite.program)
      const c = composite.uniforms
      ;[color, aux, atlas].forEach((item, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, item) })
      gl.uniform1i(c.uField, 0); gl.uniform1i(c.uAux, 1); gl.uniform1i(c.uAtlas, 2)
      const cellH = 26 * ratio, cellW = cellH * .6
      gl.uniform2f(c.uResolution, canvas.width, canvas.height); gl.uniform2f(c.uCell, cellW, cellH)
      gl.uniform2f(c.uOffset, (canvas.width - Math.ceil(canvas.width / cellW) * cellW) / 2, (canvas.height - Math.ceil(canvas.height / cellH) * cellH) / 2)
      gl.uniform2f(c.uAtlasGrid, characters.length, 1); gl.uniform1f(c.uCount, characters.length)
      gl.uniform1f(c.uDensity, .5); gl.uniform1f(c.uOpacity, .65); gl.uniform1f(c.uFlicker, 0)
      gl.uniform1f(c.uDepth, .12); gl.uniform1f(c.uGlyphTime, 0); gl.uniform1f(c.uSeedValue, 0)
      gl.uniform1f(c.uLight, 0); gl.uniform1f(c.uGradient, .12); gl.uniform1f(c.uGrain, 0); gl.uniform1f(c.uFrame, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      container.dataset.state = 'webgl'
    }
    const resize = () => {
      if (disposed) return
      try {
        const width = Math.max(1, container.clientWidth), height = Math.max(1, container.clientHeight)
        ratio = Math.min(1, window.devicePixelRatio || 1, Math.sqrt(PIXEL_BUDGET / (width * height)))
        canvas.width = Math.max(1, Math.round(width * ratio)); canvas.height = Math.max(1, Math.round(height * ratio))
        fieldWidth = Math.max(1, Math.round(canvas.width / 2)); fieldHeight = Math.max(1, Math.round(canvas.height / 2))
        gl.activeTexture(gl.TEXTURE0); gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
        ;[color, aux].forEach((item, i) => {
          gl.bindTexture(gl.TEXTURE_2D, item)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fieldWidth, fieldHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, item, 0)
        })
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1])
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Incomplete framebuffer')
        if (visible && !document.hidden) draw()
      } catch { dispose() }
    }
    const frame = (now: number) => {
      raf = 0
      if (disposed || !visible || document.hidden) return
      if (!last || now - last >= 1000 / FPS) {
        time += last ? Math.min((now - last) / 1000, .1) * .06 : 0
        last = now; draw()
      }
      raf = requestAnimationFrame(frame)
    }
    wake = () => { if (!raf && !disposed && visible && !document.hidden) raf = requestAnimationFrame(frame) }
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container)
    intersection = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); stop(); wake() })
    intersection.observe(container)
    canvas.addEventListener('webglcontextlost', lost)
    document.addEventListener('visibilitychange', visibility)
    resize(); wake()
  } catch { dispose() }
  return dispose
}
