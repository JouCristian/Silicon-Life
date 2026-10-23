import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, RoundedBox } from '@react-three/drei'
import { AdditiveBlending, CanvasTexture, CatmullRomCurve3, Group, Material, MathUtils, Mesh, MeshBasicMaterial, NearestFilter, SRGBColorSpace, Vector3 } from 'three'
import { DISPLAY_HEIGHT, DISPLAY_WIDTH } from '../core/devices/logisimDisplay'
import { useLabView } from '../stores/useLabStore'
import { usePeripheralStore } from '../stores/usePeripheralStore'
import { paintDisplayFrame } from '../components/displayPaint'
import { springStep, type SpringState } from '../motion/design'

const DECK = [10.08, 0, 0] as const
const SCREEN = [10.08, .38, 1.02] as const
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
const smoothstep = (from: number, to: number, value: number) => {
  const t = clamp01((value - from) / Math.max(.0001, to - from))
  return t * t * (3 - 2 * t)
}
const smootherstep = (value: number) => {
  const t = clamp01(value)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function createScanBeam() {
  const node = document.createElement('canvas')
  node.width = 8
  node.height = 128
  const context = node.getContext('2d')!
  const gradient = context.createLinearGradient(0, 0, 0, 128)
  gradient.addColorStop(0, 'rgba(51,157,220,0)')
  gradient.addColorStop(.24, 'rgba(82,186,241,.25)')
  gradient.addColorStop(.46, 'rgba(197,240,255,.92)')
  gradient.addColorStop(.54, 'rgba(255,255,255,1)')
  gradient.addColorStop(.68, 'rgba(66,173,230,.2)')
  gradient.addColorStop(1, 'rgba(51,157,220,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 8, 128)
  const map = new CanvasTexture(node)
  map.colorSpace = SRGBColorSpace
  map.minFilter = NearestFilter
  map.magFilter = NearestFilter
  return map
}

function createScanGrid() {
  const node = document.createElement('canvas')
  node.width = 256
  node.height = 256
  const context = node.getContext('2d')!
  context.clearRect(0, 0, 256, 256)
  context.strokeStyle = 'rgba(111, 207, 255, .85)'
  context.lineWidth = 1
  for (let y = 4; y < 256; y += 13) {
    context.globalAlpha = y % 39 === 4 ? .7 : .24
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(256, y)
    context.stroke()
  }
  context.globalAlpha = .35
  context.strokeRect(.5, .5, 255, 255)
  const map = new CanvasTexture(node)
  map.colorSpace = SRGBColorSpace
  return map
}

type Fadeable = Material & { opacity: number; transparent: boolean; depthWrite: boolean; userData: Record<string, unknown> }

/** A sidecar display whose pixels are the committed CpuState.display snapshot.
 *  Presence is a holographic reveal: a scan line crosses the panel while the
 *  enclosure materialises. Removal reverses into a blurred contraction around
 *  the screen centre instead of hiding the mesh at the end of a drop. */
export function PeripheralDisplay({ screenAnchor }: { screenAnchor: RefObject<Group | null> }) {
  const { cpu, trace, inspection } = useLabView()
  const installed = usePeripheralStore(state => state.installed.includes('display'))
  const focus = usePeripheralStore(state => state.focus)
  const display = inspection && trace ? trace.after.display : cpu.display
  const root = useRef<Group>(null), pivot = useRef<Group>(null)
  const scanLine = useRef<Mesh>(null), scanMaterial = useRef<MeshBasicMaterial>(null)
  const scanBeam = useRef<Mesh>(null), scanBeamMaterial = useRef<MeshBasicMaterial>(null)
  const scanVeil = useRef<Mesh>(null), scanVeilMaterial = useRef<MeshBasicMaterial>(null)
  const ghost = useRef<Mesh>(null), ghostMaterial = useRef<MeshBasicMaterial>(null)
  const collapseCore = useRef<Mesh>(null), collapseMaterial = useRef<MeshBasicMaterial>(null)
  const pulse = useRef<Mesh>(null), cable = useRef<Group>(null)
  const progress = useRef(0)
  const tween = useRef({ from: 0, to: 0, elapsed: 0, active: false })
  const HologramDuration = 1.25
  const removalNotified = useRef(false)
  const wasInstalled = useRef(installed)
  const lastWrites = useRef(display.writes), pulseAt = useRef(1)
  const latestDisplay = useRef(display), displayDirty = useRef(true)
  const fadeMaterials = useRef<{ material: Fadeable; baseOpacity: number; baseDepthWrite: boolean }[]>([])
  const pivotScale = useRef<SpringState>({ position: 1, velocity: 0 })
  const fadeSpring = useRef<SpringState>({ position: 0, velocity: 0 })

  const canvas = useMemo(() => {
    if (typeof document === 'undefined') return null
    const node = document.createElement('canvas')
    node.width = DISPLAY_WIDTH
    node.height = DISPLAY_HEIGHT
    return node
  }, [])
  const texture = useMemo(() => {
    if (!canvas) return null
    const map = new CanvasTexture(canvas)
    map.colorSpace = SRGBColorSpace
    map.magFilter = NearestFilter
    map.minFilter = NearestFilter
    map.generateMipmaps = false
    return map
  }, [canvas])
  const blurCanvas = useMemo(() => {
    if (typeof document === 'undefined') return null
    const node = document.createElement('canvas')
    node.width = DISPLAY_WIDTH
    node.height = DISPLAY_HEIGHT
    return node
  }, [])
  const blurTexture = useMemo(() => {
    if (!blurCanvas) return null
    const map = new CanvasTexture(blurCanvas)
    map.colorSpace = SRGBColorSpace
    map.magFilter = NearestFilter
    map.minFilter = NearestFilter
    map.generateMipmaps = false
    return map
  }, [blurCanvas])
  const scanGrid = useMemo(createScanGrid, [])
  const scanBeamTexture = useMemo(createScanBeam, [])
  useEffect(() => { latestDisplay.current = display; displayDirty.current = true }, [display])
  useEffect(() => () => { texture?.dispose(); blurTexture?.dispose(); scanGrid.dispose(); scanBeamTexture.dispose() }, [texture, blurTexture, scanGrid, scanBeamTexture])

  const busCurve = useMemo(() => new CatmullRomCurve3([
    new Vector3(4.65, -2.78, .92),
    new Vector3(5.55, -2.3, .95),
    new Vector3(6.7, -2.52, .92),
    new Vector3(7.7, -2.92, .94),
    new Vector3(8.55, -2.72, .9),
    new Vector3(9.38, -2.82, .88),
    new Vector3(9.72, -2.78, .86),
  ], false, 'catmullrom', .5), [])

  useLayoutEffect(() => { if (root.current) root.current.visible = false }, [])
  useLayoutEffect(() => {
    if (!root.current) return
    const seen = new Set<Material>(), list: typeof fadeMaterials.current = []
    root.current.traverse(node => {
      const raw = (node as Mesh).material
      if (!raw) return
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        if (!value || seen.has(value) || value.userData?.noFade) continue
        const material = value as Fadeable
        seen.add(material)
        list.push({ material, baseOpacity: material.opacity ?? 1, baseDepthWrite: material.depthWrite ?? true })
        material.transparent = true
        material.needsUpdate = true
      }
    })
    fadeMaterials.current = list
  }, [])

  useEffect(() => {
    const previous = wasInstalled.current
    wasInstalled.current = installed
    const to = installed ? 1 : 0
    tween.current = { from: progress.current, to, elapsed: 0, active: progress.current !== to }
    if (!installed) removalNotified.current = false
    if (!installed && previous) {
      // Anticipation: a short outward impulse before the spring pulls the
      // enclosure into the centre. The result is a soft "pop" that overshoots
      // slightly, then snaps down into a point with visible spring rebound.
      pivotScale.current.position = Math.max(1, pivotScale.current.position)
      pivotScale.current.velocity = 5.4
      // Freeze the last real frame into a blurred spectral copy. The ghost then
      // contracts with the enclosure instead of the screen simply switching off.
      if (canvas && blurCanvas && blurTexture) {
        const context = blurCanvas.getContext('2d')
        if (context) {
          context.clearRect(0, 0, DISPLAY_WIDTH, DISPLAY_HEIGHT)
          context.filter = 'blur(6px)'
          context.drawImage(canvas, 0, 0)
          context.filter = 'none'
          blurTexture.needsUpdate = true
        }
      }
      if (ghost.current) ghost.current.visible = true
    }
    if (installed && ghost.current) ghost.current.visible = false
    if (!installed) focus(null)
  }, [installed, focus, canvas, blurCanvas, blurTexture])

  useFrame((_, dt) => {
    dt = Math.min(.05, Math.max(0, dt))
    if (displayDirty.current && canvas && texture) {
      paintDisplayFrame(canvas, latestDisplay.current)
      texture.needsUpdate = true
      displayDirty.current = false
    }
    const anim = tween.current
    if (anim.active) {
      anim.elapsed += dt
      const raw = Math.min(1, anim.elapsed / (installed ? HologramDuration : .9))
      progress.current = anim.from + (anim.to - anim.from) * smootherstep(raw)
      if (raw >= 1) { progress.current = anim.to; anim.active = false }
    }
    const p = progress.current
    const removal = 1 - p
    if (root.current) root.current.visible = p > .001
    if (pivot.current) {
      if (!installed) {
        // Pop outward first, then accelerate into the centre with a small
        // damped rebound. Explicit shaping keeps the "q弹" readable even when
        // the panel starts collapsing immediately.
        const r = removal
        const pop = .12 * Math.sin(Math.min(1, r / .2) * Math.PI)
        const collapse = smoothstep(.2, .68, r)
        const bounce = .06 * Math.sin(collapse * Math.PI * 2.4) * (1 - collapse)
        pivotScale.current.position = Math.max(.02, 1 + pop - 1.02 * collapse + bounce)
        pivotScale.current.velocity = 0
      } else if (p < .02) {
        pivotScale.current.position = 1
        pivotScale.current.velocity = 0
        removalNotified.current = false
      } else {
        springStep(pivotScale.current, 1, dt, 2.2)
      }
      pivot.current.scale.setScalar(Math.max(.004, pivotScale.current.position))
    }
    if (!installed && p <= .001 && !removalNotified.current) {
      removalNotified.current = true
      window.dispatchEvent(new CustomEvent('silicon:peripheral-removed', { detail: 'display' }))
    }
    if (collapseCore.current && collapseMaterial.current) {
      const active = !installed && p < .32 && p > .001
      collapseCore.current.visible = active
      collapseCore.current.scale.setScalar(.9 + .48 * Math.sin(removal * Math.PI))
      collapseMaterial.current.opacity = active
        ? smoothstep(0, .14, removal) * (1 - smoothstep(.78, .96, removal)) * .95
        : 0
    }

    // The solid body fades into the spectral copy in about half a second while
    // the pivot contracts much more slowly. This is deliberately asymmetric:
    // removal reads as "defocus, then collapse", not "drop and blink out".
    springStep(fadeSpring.current, installed ? 1 : 0, dt, 3)
    const fade = clamp01(fadeSpring.current.position)
    const scene = document.querySelector('[data-testid="scene-root"]')
    if (scene) {
      scene.setAttribute('data-peripheral-presence', p.toFixed(4))
      scene.setAttribute('data-peripheral-fade', fade.toFixed(4))
      scene.setAttribute('data-peripheral-materials', String(fadeMaterials.current.length))
    }
    for (const entry of fadeMaterials.current) {
      entry.material.opacity = entry.baseOpacity * fade
      entry.material.depthWrite = fade > .995 ? entry.baseDepthWrite : false
    }

    const scan = smoothstep(.02, .9, p)
    const scanning = installed && p < .995
    if (scanLine.current && scanMaterial.current) {
      if (installed && scanning) {
        const y = -3.35 + 6.7 * scan
        scanLine.current.visible = true
        scanLine.current.position.y = y
        scanLine.current.position.z = 1.14
        scanMaterial.current.opacity = Math.sin(scan * Math.PI) * 1.05
        if (scanBeam.current && scanBeamMaterial.current) {
          scanBeam.current.visible = true
          scanBeam.current.position.y = y
          scanBeamMaterial.current.opacity = Math.sin(scan * Math.PI) * 1.05
        }
        if (scanVeil.current && scanVeilMaterial.current) {
          scanVeil.current.visible = true
          scanVeilMaterial.current.opacity = Math.sin(scan * Math.PI) * .42
        }
      } else {
        scanLine.current.visible = false
        scanMaterial.current.opacity = 0
        if (scanBeam.current && scanBeamMaterial.current) {
          scanBeam.current.visible = false
          scanBeamMaterial.current.opacity = 0
        }
        if (scanVeil.current && scanVeilMaterial.current) {
          scanVeil.current.visible = false
          scanVeilMaterial.current.opacity = 0
        }
      }
    }

    if (ghost.current && ghostMaterial.current) {
      if (!installed && removal > .01) {
        ghost.current.visible = true
        ghost.current.scale.setScalar(1.02 - .2 * removal)
        ghostMaterial.current.opacity = Math.sin(Math.min(1, removal * 1.08) * Math.PI) * .9
      } else {
        ghost.current.visible = false
        ghostMaterial.current.opacity = 0
      }
    }

    if (cable.current) cable.current.visible = p > .18
    if (pulse.current) {
      if (display.writes !== lastWrites.current) {
        lastWrites.current = display.writes
        pulseAt.current = 0
      }
      if (pulseAt.current < 1) {
        pulseAt.current = Math.min(1, pulseAt.current + dt / .44)
        const travel = smootherstep(pulseAt.current)
        pulse.current.position.copy(busCurve.getPointAt(MathUtils.clamp(travel, 0, 1)))
        pulse.current.visible = p > .3
        pulse.current.scale.setScalar(.7 + Math.sin(travel * Math.PI) * .65)
      } else {
        pulse.current.visible = false
      }
    }
  }, -.35)

  return <>
    <group ref={screenAnchor} position={SCREEN} />
    <group ref={root} onClick={event => { event.stopPropagation(); if (installed) focus('display') }} onPointerOver={() => { if (installed) document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
      <group ref={pivot} position={SCREEN}>
        <group position={[-SCREEN[0], -SCREEN[1], -SCREEN[2]]}>
          <group ref={cable}>
            <mesh><tubeGeometry args={[busCurve, 48, .058, 6, false]} /><meshStandardMaterial color="#758491" metalness={.9} roughness={.26} /></mesh>
            <mesh><tubeGeometry args={[busCurve, 48, .022, 5, false]} /><meshStandardMaterial color="#0d2a40" emissive="#3a9dd6" emissiveIntensity={1.6} metalness={.2} roughness={.4} /></mesh>
            <mesh position={[8.4, -2.76, .9]}><boxGeometry args={[1.02, .2, .16]} /><meshStandardMaterial color="#1a252e" metalness={.82} roughness={.3} /><Edges color="#738696" threshold={20} /></mesh>
            <mesh position={[8.4, -2.76, .99]}><boxGeometry args={[.55, .035, .02]} /><meshBasicMaterial color="#63c8ff" toneMapped={false} /></mesh>
          </group>
          <group>
            <RoundedBox args={[4.3, 6.65, .24]} radius={.11} smoothness={4} position={[DECK[0], DECK[1], DECK[2]]}>
              <meshStandardMaterial color="#10151b" metalness={.58} roughness={.42} />
              <Edges scale={1.001} color="#586878" threshold={18} />
            </RoundedBox>
            <RoundedBox args={[4.5, 6.85, .1]} radius={.16} smoothness={3} position={[DECK[0], DECK[1], DECK[2] - .19]}>
              <meshStandardMaterial color="#6f7d88" metalness={.94} roughness={.3} />
              <Edges scale={1.001} color="#a6b5c3" threshold={20} />
            </RoundedBox>
            {[3.28, -3.28].map(y => <mesh key={`deck-y-${y}`} position={[DECK[0], y, DECK[2] + .15]}><boxGeometry args={[4.38, .035, .035]} /><meshStandardMaterial color="#778894" metalness={.92} roughness={.28} /></mesh>)}
            {[2.12, -2.12].map(x => <mesh key={`deck-x-${x}`} position={[DECK[0] + x, 0, DECK[2] + .15]}><boxGeometry args={[.035, 6.58, .035]} /><meshStandardMaterial color="#778894" metalness={.92} roughness={.28} /></mesh>)}
            <mesh position={[DECK[0], -2.22, DECK[2] + .19]}><boxGeometry args={[3.1, .03, .015]} /><meshBasicMaterial color="#2b8bc4" toneMapped={false} /></mesh>
            <mesh position={[DECK[0], -2.33, DECK[2] + .18]}><boxGeometry args={[.42, .025, .015]} /><meshBasicMaterial color="#1b4058" toneMapped={false} /></mesh>
            {[-2.04, 2.04].map(x => <mesh key={`rail-${x}`} position={[DECK[0] + x, 0, DECK[2] + .13]}><boxGeometry args={[.035, 6.1, .035]} /><meshStandardMaterial color="#6d7c88" metalness={.9} roughness={.3} /></mesh>)}
            {[-1.55, -1.08, -.61].map((y, i) => <mesh key={`vent-${i}`} position={[DECK[0] - 1.48, y - 1.2, DECK[2] + .14]}><boxGeometry args={[.7, .025, .018]} /><meshStandardMaterial color="#2e3b46" metalness={.5} roughness={.62} /></mesh>)}
            <mesh position={[DECK[0] + 1.72, -2.78, DECK[2] + .03]}><boxGeometry args={[.55, .5, .3]} /><meshStandardMaterial color="#151d25" metalness={.7} roughness={.36} /></mesh>
            <mesh position={[DECK[0] + 1.72, -2.78, DECK[2] + .19]}><boxGeometry args={[.32, .05, .02]} /><meshBasicMaterial color="#53b7ec" toneMapped={false} /></mesh>
            <mesh position={[DECK[0] - 2.03, -2.78, DECK[2] + .05]}><boxGeometry args={[.34, .4, .18]} /><meshStandardMaterial color="#1b252e" metalness={.8} roughness={.32} /></mesh>
          </group>
          <group>
            <RoundedBox args={[1.18, .13, 1.15]} radius={.1} smoothness={4} position={[DECK[0], -2.55, DECK[2] + .72]}><meshStandardMaterial color="#1b242c" metalness={.9} roughness={.26} /><Edges color="#61717e" threshold={22} /></RoundedBox>
            <mesh position={[DECK[0], -1.95, DECK[2] + .74]} rotation={[0, 0, -.08]}><boxGeometry args={[.16, 1.18, .14]} /><meshStandardMaterial color="#71808c" metalness={.96} roughness={.22} /></mesh>
            <mesh position={[DECK[0], -1.31, DECK[2] + .94]} rotation={[.28, 0, .08]}><boxGeometry args={[.5, .08, .45]} /><meshStandardMaterial color="#394752" metalness={.9} roughness={.28} /></mesh>
            <RoundedBox args={[3.76, 3.76, .25]} radius={.14} smoothness={5} position={[DECK[0], SCREEN[1], SCREEN[2] - .1]}>
              <meshStandardMaterial color="#161e26" metalness={.78} roughness={.31} />
              <Edges scale={1.001} color="#9babb8" threshold={22} />
            </RoundedBox>
            <RoundedBox args={[3.96, 3.96, .1]} radius={.2} smoothness={4} position={[DECK[0], SCREEN[1], SCREEN[2] - .23]}>
              <meshStandardMaterial color="#7b8994" metalness={.97} roughness={.24} />
              <Edges scale={1.001} color="#bccbd6" threshold={26} />
            </RoundedBox>
            <mesh position={[DECK[0], SCREEN[1], SCREEN[2] + .045]}>
              <planeGeometry args={[3.18, 3.18]} />
              {texture ? <meshBasicMaterial map={texture} toneMapped={false} /> : <meshBasicMaterial color="#020305" />}
            </mesh>
            <mesh position={[DECK[0], SCREEN[1], SCREEN[2] + .047]}>
              <planeGeometry args={[3.2, 3.2]} />
              <meshPhysicalMaterial color="#91b6d2" transparent opacity={.055} roughness={.08} metalness={.2} depthWrite={false} />
            </mesh>
            <mesh position={[DECK[0], SCREEN[1] - 2.02, SCREEN[2] + .08]}><boxGeometry args={[.14, .022, .02]} /><meshBasicMaterial color="#4e6879" toneMapped={false} /></mesh>
            <mesh position={[DECK[0] + 1.66, SCREEN[1] - 1.82, SCREEN[2] + .08]}><sphereGeometry args={[.025, 10, 10]} /><meshBasicMaterial color="#73c7ff" toneMapped={false} /></mesh>
            {[-1.52, 1.52].map(x => [-1.52, 1.52].map(y => <mesh key={`${x}-${y}`} position={[DECK[0] + x, SCREEN[1] + y, SCREEN[2] + .04]}><cylinderGeometry args={[.035, .035, .018, 12]} /><meshStandardMaterial color="#b1c0cb" metalness={.95} roughness={.2} /></mesh>))}
            <mesh position={[DECK[0], SCREEN[1] + 2.05, SCREEN[2] - .04]}><boxGeometry args={[.28, .018, .02]} /><meshBasicMaterial color="#396079" toneMapped={false} /></mesh>
          </group>
          <mesh ref={ghost} position={[DECK[0], SCREEN[1], SCREEN[2] + .1]} renderOrder={12} visible={false}>
            <planeGeometry args={[3.25, 3.25]} />
            <meshBasicMaterial ref={ghostMaterial} map={blurTexture ?? undefined} transparent opacity={0} depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} userData={{ noFade: true }} />
          </mesh>
          <mesh ref={pulse} visible={false}><sphereGeometry args={[.085, 12, 12]} /><meshBasicMaterial color="#8bd5ff" toneMapped={false} /></mesh>
        </group>
      </group>
      <mesh ref={collapseCore} position={[DECK[0], SCREEN[1], SCREEN[2] + .2]} renderOrder={14} visible={false}>
        <sphereGeometry args={[.075, 16, 16]} />
        <meshBasicMaterial ref={collapseMaterial} color="#c9f3ff" transparent opacity={0} depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} userData={{ noFade: true }} />
      </mesh>
      <mesh ref={scanVeil} position={[DECK[0], SCREEN[1], SCREEN[2] + .1]} renderOrder={11} visible={false}>
        <planeGeometry args={[4.3, 6.7]} />
        <meshBasicMaterial ref={scanVeilMaterial} map={scanGrid} color="#63b8e8" transparent opacity={0} depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} userData={{ noFade: true }} />
      </mesh>
      <mesh ref={scanBeam} position={[DECK[0], 0, 1.15]} renderOrder={12} visible={false}>
        <planeGeometry args={[4.65, 1.65]} />
        <meshBasicMaterial ref={scanBeamMaterial} map={scanBeamTexture} transparent opacity={0} depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} userData={{ noFade: true }} />
      </mesh>
      <mesh ref={scanLine} position={[DECK[0], 0, 1.16]} renderOrder={13} visible={false}>
        <planeGeometry args={[4.55, .16]} />
        <meshBasicMaterial ref={scanMaterial} color="#9ae4ff" transparent opacity={0} depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} userData={{ noFade: true }} />
      </mesh>
    </group>
  </>
}
