// React Bits GradientWaves adaptation; copyright (c) 2026 David Haz.
// MIT + Commons Clause: third_party/react-bits/LICENSE.md.
import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useMotionPreference } from '../../motion/useMotionPreference'
import './GradientWaves.css'

const ROOT = 'gradient-waves-container'
const CANVAS = 'gradient-waves-canvas'
const MAX_SWELLS = 4
const CAMERA_HEIGHT = 30
const INTRO_SECONDS = 2.6
const QUALITY = { low: 56, medium: 84, high: 120 } as const
const FPS = 30
const PIXEL_BUDGET = 1280 * 720

export type GradientWavesQuality = keyof typeof QUALITY

export interface GradientWavesProps {
  horizonColor?: string
  waveColor?: string
  crestColor?: string
  backgroundColor?: string
  speed?: number
  amplitude?: number
  waveScale?: number
  waveRatio?: number
  swell?: number
  turbulence?: number
  tilt?: number
  zoom?: number
  height?: number
  fogDepth?: number
  relief?: number
  lightAngle?: number
  sheen?: number
  brightness?: number
  opacity?: number
  grain?: number
  quality?: GradientWavesQuality
  intro?: boolean
  paused?: boolean
  dpr?: number
  className?: string
  style?: CSSProperties
}

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uClock;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uHeight;
uniform float uTilt;
uniform float uZoom;
uniform vec2 uLook;
uniform float uFogDepth;
uniform float uBrightness;
uniform float uOpacity;
uniform float uGrain;
uniform vec3 uHorizon;
uniform vec3 uWave;
uniform vec3 uCrest;
uniform vec3 uBackground;
uniform float uOpaque;
uniform float uLight;
uniform vec3 uSun;
uniform float uRelief;
uniform float uSheen;
uniform float uSteps;
uniform float uStride;
uniform vec3 uIntro;
uniform vec3 uSwells[${MAX_SWELLS}];
uniform float uSwellWidth;
out vec4 outColor;

const float FAR = 4000.0;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 surface(vec2 xy) {
  vec2 freq = vec2(uWaveScale / 7.0, (uWaveScale * uWaveRatio) / 3.0);
  vec4 tc = vec4(uTime / 0.130, uTime / 0.810, uTime / 0.200, uTime / 0.710);
  float a = xy.x + tc.x;
  float swellPhase = (xy.y + a) / 20.0 + tc.y;
  float bend = uSwell * cos(swellPhase) / 20.0;
  float mx = a + uSwell * sin(swellPhase);
  float crossPhase = xy.x / 23.0 + tc.w;
  float my = xy.y - tc.z + uTurbulence * cos(crossPhase);
  float twist = -uTurbulence * sin(crossPhase) / 23.0;
  float cx = cos(mx * freq.x);
  float cy = cos(my * freq.y);
  float rise = 1.0;
  if (uIntro.z > 0.0) rise = mix(1.0, smoothstep(uIntro.y * 0.45, uIntro.y * 1.6, xy.x), uIntro.z);
  float amp = uAmplitude * rise;
  float h = (sin(mx * freq.x) + sin(my * freq.y)) * amp + uHeight;
  float dx = amp * (freq.x * cx * (1.0 + bend) + freq.y * cy * twist);
  float dy = amp * (freq.x * cx * bend + freq.y * cy);
  for (int k = 0; k < ${MAX_SWELLS}; k++) {
    vec3 sw = uSwells[k];
    if (sw.z <= 0.0) continue;
    float u = (xy.x - sw.x) / uSwellWidth;
    float v = (xy.y - sw.y) / (uSwellWidth * 3.5);
    float bump = sw.z * exp(-u * u - v * v);
    h += bump;
    dx += bump * (-2.0 * u / uSwellWidth);
    dy += bump * (-2.0 * v / (uSwellWidth * 3.5));
  }
  return vec3(h, dx, dy);
}

float march(vec3 origin, vec3 dir) {
  float dist = 0.0;
  for (int i = 0; i < 128; i++) {
    if (float(i) >= uSteps) break;
    float gap = origin.z + dist * dir.z - surface(origin.xy + dist * dir.xy).x;
    if (abs(gap) < 0.002 * dist + 0.01) break;
    dist += uStride * gap;
    if (!(abs(dist) < FAR)) return FAR;
  }
  return dist;
}

void main() {
  float c;
  float s;
  float vfov = (3.14159 / 2.3) / max(uZoom, 0.05);
  vec3 cam = vec3(0.0, 0.0, ${CAMERA_HEIGHT.toFixed(1)});
  vec2 uv = gl_FragCoord.xy / uResolution - 0.5;
  uv.x *= uResolution.x / uResolution.y;
  uv.y *= -1.0;

  vec3 dir = vec3(0.0, 0.0, -1.0);
  float ulen = length(uv);
  float xrot = vfov * ulen;
  c = cos(xrot);
  s = sin(xrot);
  dir = mat3(1.0, 0.0, 0.0, 0.0, c, -s, 0.0, s, c) * dir;
  vec2 nuv = ulen > 1e-5 ? uv / ulen : vec2(1.0, 0.0);
  dir = mat3(nuv.x, -nuv.y, 0.0, nuv.y, nuv.x, 0.0, 0.0, 0.0, 1.0) * dir;
  c = cos(uTilt + uLook.y);
  s = sin(uTilt + uLook.y);
  dir = mat3(c, 0.0, s, 0.0, 1.0, 0.0, -s, 0.0, c) * dir;
  c = cos(uLook.x);
  s = sin(uLook.x);
  dir = mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0) * dir;

  float dist = march(cam, dir);
  vec3 pos = cam + dist * dir;
  vec3 field = surface(pos.xy);
  vec3 view = -dir;

  float crest = clamp((field.x - uHeight) / max(2.0 * uAmplitude, 0.001) * 0.5 + 0.5, 0.0, 1.0);
  vec3 body = mix(uWave, uCrest, smoothstep(0.45, 1.0, crest) * 0.5);
  vec3 normal = normalize(vec3(-field.yz * (1.0 + 1.5 * uRelief), 1.0));
  float diffuse = clamp(dot(normal, uSun) * 0.5 + 0.5, 0.0, 1.0);
  float lightness = mix(1.0, diffuse * diffuse * (3.0 - 2.0 * diffuse), uRelief);
  float sheen = pow(clamp(dot(normal, normalize(uSun + view)), 0.0, 1.0), 14.0) * uSheen * (0.4 + 0.6 * uRelief);
  float rim = pow(1.0 - clamp(dot(normal, view), 0.0, 1.0), 3.0);

  vec3 col;
  float alpha;
  float haze = 1.0 - exp(-dist / (uFogDepth * 5.0));
  float fade = 1.0 - smoothstep(0.35, 1.0, haze);
  if (uLight < 0.5) {
    vec3 lit = mix(uHorizon * 0.18, body, lightness) + uCrest * sheen;
    lit = mix(lit, uHorizon, rim * 0.15 * uRelief);
    col = mix(lit, uHorizon, smoothstep(0.0, 1.0, haze)) * 0.85 * uBrightness;
    alpha = fade;
  } else {
    vec3 hue = mix(uHorizon, body, 0.35 + 0.65 * lightness);
    float density = mix(0.16, 0.9, 1.0 - lightness);
    density *= 1.0 - clamp(sheen, 0.0, 1.0) * 0.85;
    density *= 1.0 - 0.5 * smoothstep(0.0, 1.0, haze);
    col = hue;
    alpha = fade * clamp(density * uBrightness, 0.0, 1.0);
  }

  float reveal = uIntro.x;
  col = clamp(col, 0.0, 1.0);
  float grain = (hash(gl_FragCoord.xy + fract(uClock) * 64.0) - 0.5) * uGrain;
  alpha = clamp(alpha * (1.0 + grain), 0.0, 1.0) * reveal * uOpacity;
  if (uOpaque > 0.5) {
    outColor = vec4(mix(uBackground, col, alpha), 1.0);
  } else {
    outColor = vec4(col * alpha, alpha);
  }
}`

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const easeInOut = (t: number) => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
let probe: CanvasRenderingContext2D | null = null

const parseColor = (value: string, fallback: [number, number, number] | null) => {
  if (value === 'transparent') return null
  if (typeof document === 'undefined') return fallback
  if (!probe) probe = document.createElement('canvas').getContext('2d')
  if (!probe) return fallback
  probe.fillStyle = '#000000'; probe.fillStyle = value
  const text = probe.fillStyle
  if (text.startsWith('#')) {
    const hex = parseInt(text.slice(1), 16)
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255] as [number, number, number]
  }
  const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(text)
  if (!match) return fallback
  if (match[4] !== undefined && Number(match[4]) === 0) return null
  return [Number(match[1]) / 255, Number(match[2]) / 255, Number(match[3]) / 255] as [number, number, number]
}

const compile = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source); gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

export default function GradientWaves({
  horizonColor = '#0b1a2d',
  waveColor = '#2d5b7e',
  crestColor = '#cfe6ff',
  backgroundColor = 'transparent',
  speed = .24,
  amplitude = 1.6,
  waveScale = .5,
  waveRatio = .9,
  swell = 28,
  turbulence = 18,
  tilt = 68,
  zoom = .95,
  height = 4.5,
  fogDepth = 20,
  relief = .75,
  lightAngle = 115,
  sheen = .25,
  brightness = .62,
  opacity = .82,
  grain = .05,
  quality = 'medium',
  intro = true,
  paused = false,
  dpr = 1.5,
  className = '',
  style,
}: GradientWavesProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef<GradientWavesProps & { horizon: [number, number, number]; wave: [number, number, number]; crest: [number, number, number]; paper: [number, number, number] | null }>({} as never)
  const reduced = useMotionPreference()
  const colors = useMemo(() => ({
    horizon: parseColor(horizonColor, [.043, .102, .176]) ?? [.043, .102, .176],
    wave: parseColor(waveColor, [.176, .357, .494]) ?? [.176, .357, .494],
    crest: parseColor(crestColor, [.812, .902, 1]) ?? [.812, .902, 1],
    paper: parseColor(backgroundColor, null),
  }), [horizonColor, waveColor, crestColor, backgroundColor])
  settingsRef.current = {
    horizonColor, waveColor, crestColor, backgroundColor, speed, amplitude, waveScale, waveRatio,
    swell, turbulence, tilt, zoom, height, fogDepth, relief, lightAngle, sheen, brightness,
    opacity, grain, quality, intro, paused, dpr, className, style, ...colors,
  }

  useEffect(() => {
    if (!containerRef.current || reduced) return
    const container = containerRef.current
    const canvas = document.createElement('canvas')
    canvas.className = CANVAS
    canvas.setAttribute('aria-hidden', 'true')
    container.append(canvas)
    const gl = canvas.getContext('webgl2', {
      alpha: true, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: true, powerPreference: 'high-performance',
    })
    if (!gl) { canvas.remove(); return }
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : ''
    if (/swiftshader|llvmpipe|software/i.test(renderer)) {
      container.dataset.state = 'fallback'
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
      return
    }
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vertex || !fragment || !program) { canvas.remove(); return }
    gl.attachShader(program, vertex); gl.attachShader(program, fragment)
    gl.bindAttribLocation(program, 0, 'aPosition'); gl.linkProgram(program)
    gl.deleteShader(vertex); gl.deleteShader(fragment)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program); canvas.remove(); return
    }
    const names = ['uResolution', 'uTime', 'uClock', 'uAmplitude', 'uWaveScale', 'uWaveRatio',
      'uSwell', 'uTurbulence', 'uHeight', 'uTilt', 'uZoom', 'uLook', 'uFogDepth', 'uBrightness',
      'uOpacity', 'uGrain', 'uHorizon', 'uWave', 'uCrest', 'uBackground', 'uOpaque', 'uLight',
      'uSun', 'uRelief', 'uSheen', 'uSteps', 'uStride', 'uIntro', 'uSwells', 'uSwellWidth']
    const u: Record<string, WebGLUniformLocation | null> = {}
    names.forEach(name => { u[name] = gl.getUniformLocation(program, name) })
    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    if (!vao || !buffer) { if (vao) gl.deleteVertexArray(vao); if (buffer) gl.deleteBuffer(buffer); gl.deleteProgram(program); canvas.remove(); return }
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.useProgram(program)

    const state = {
      width: 1, height: 1, cssWidth: 0, cssHeight: 0,
      time: 0, clock: 0, last: 0, lastDraw: 0, raf: 0,
      visible: false, introAt: -1,
    }
    const swellData = new Float32Array(MAX_SWELLS * 3)

    const fit = () => {
      const s = settingsRef.current
      const ratio = Math.min(window.devicePixelRatio || 1, s.dpr ?? 1.5, 1.5, Math.sqrt(PIXEL_BUDGET / Math.max(1, state.cssWidth * state.cssHeight)))
      const width = Math.max(1, Math.round(state.cssWidth * ratio))
      const height = Math.max(1, Math.round(state.cssHeight * ratio))
      if (width === state.width && height === state.height) return
      state.width = width; state.height = height
      canvas.width = width; canvas.height = height
    }

    const measure = () => {
      state.cssWidth = container.clientWidth
      state.cssHeight = container.clientHeight
      fit(); wake()
    }

    const introProgress = (s: typeof settingsRef.current) => {
      if (!s.intro || reduced || state.introAt < 0) return 1
      return clamp((state.clock - state.introAt) / INTRO_SECONDS, 0, 1)
    }

    const render = () => {
      const s = settingsRef.current
      gl.viewport(0, 0, state.width, state.height)
      gl.uniform2f(u.uResolution, state.width, state.height)
      gl.uniform1f(u.uTime, state.time)
      gl.uniform1f(u.uClock, state.clock)
      gl.uniform1f(u.uAmplitude, s.amplitude ?? 1.6)
      gl.uniform1f(u.uWaveScale, s.waveScale ?? .5)
      gl.uniform1f(u.uWaveRatio, s.waveRatio ?? .9)
      gl.uniform1f(u.uSwell, s.swell ?? 28)
      gl.uniform1f(u.uTurbulence, s.turbulence ?? 18)
      gl.uniform1f(u.uHeight, s.height ?? 4.5)
      gl.uniform1f(u.uTilt, ((s.tilt ?? 68) * Math.PI) / 180)
      gl.uniform1f(u.uZoom, Math.max(.05, s.zoom ?? .95))
      gl.uniform2f(u.uLook, 0, 0)
      gl.uniform1f(u.uFogDepth, Math.max(.5, s.fogDepth ?? 20))
      gl.uniform1f(u.uBrightness, Math.max(0, s.brightness ?? .62))
      gl.uniform1f(u.uOpacity, clamp(s.opacity ?? .82, 0, 1))
      gl.uniform1f(u.uGrain, Math.max(0, s.grain ?? .05))
      gl.uniform3fv(u.uHorizon, s.horizon)
      gl.uniform3fv(u.uWave, s.wave)
      gl.uniform3fv(u.uCrest, s.crest)
      const paper = s.paper ?? [0, 0, 0]
      gl.uniform3f(u.uBackground, paper[0], paper[1], paper[2])
      gl.uniform1f(u.uOpaque, s.paper ? 1 : 0)
      gl.uniform1f(u.uLight, 0)
      const angle = ((s.lightAngle ?? 115) * Math.PI) / 180
      const altitude = .52
      gl.uniform3f(u.uSun, Math.cos(altitude) * Math.cos(angle), Math.cos(altitude) * Math.sin(angle), Math.sin(altitude))
      gl.uniform1f(u.uRelief, clamp(s.relief ?? .75, 0, 1))
      gl.uniform1f(u.uSheen, Math.max(0, s.sheen ?? .25))
      gl.uniform1f(u.uSteps, QUALITY[s.quality ?? 'medium'])
      const slope = (s.amplitude ?? 1.6) * (((s.waveScale ?? .5) / 7) * (1 + Math.abs(s.swell ?? 28) / 20) + (((s.waveScale ?? .5) * (s.waveRatio ?? .9)) / 3) * (1 + Math.abs(s.turbulence ?? 18) / 23))
      const progress = introProgress(s)
      const shown = Math.min(1, progress / .22)
      const crest = 160 * Math.pow(3 / 160, easeInOut(Math.max(0, (progress - .1) / .9)))
      const settle = clamp((progress - .75) / .25, 0, 1)
      gl.uniform3f(u.uIntro, shown * shown * (3 - 2 * shown), crest, 1 - settle * settle * (3 - 2 * settle))
      swellData.fill(0)
      gl.uniform3fv(u.uSwells, swellData)
      gl.uniform1f(u.uSwellWidth, 8)
      gl.uniform1f(u.uStride, .9 / Math.max(1, slope / 1.5))
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      container.dataset.state = 'webgl'
    }

    const tick = (now: number) => {
      state.raf = 0
      if (!state.visible || document.hidden) return
      const s = settingsRef.current
      const dt = state.last ? Math.min((now - state.last) / 1000, .1) : 0
      state.last = now
      state.clock += dt
      if (state.introAt < 0) state.introAt = state.clock
      if (!s.paused && !reduced) state.time += dt * (s.speed ?? .24)
      if (!state.lastDraw || now - state.lastDraw >= 1000 / FPS) {
        state.lastDraw = now
        render()
      }
      state.raf = requestAnimationFrame(tick)
    }

    const wake = () => {
      if (state.raf || !state.visible || document.hidden) return
      state.last = 0
      state.raf = requestAnimationFrame(tick)
    }

    const visibility = new IntersectionObserver(entries => {
      state.visible = entries.some(entry => entry.isIntersecting)
      wake()
    })
    visibility.observe(container)
    const sizes = new ResizeObserver(measure)
    sizes.observe(container)
    measure()
    document.addEventListener('visibilitychange', wake)

    return () => {
      cancelAnimationFrame(state.raf)
      document.removeEventListener('visibilitychange', wake)
      visibility.disconnect(); sizes.disconnect()
      gl.deleteProgram(program); gl.deleteBuffer(buffer); gl.deleteVertexArray(vao)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
  }, [reduced])

  return <div
    ref={containerRef}
    className={[ROOT, className].filter(Boolean).join(' ')}
    style={style}
    aria-hidden="true"
    data-state="fallback"
  />
}
