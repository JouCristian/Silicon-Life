import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Html, OrbitControls } from '@react-three/drei'
import { Group, PerspectiveCamera, Vector3 } from 'three'
import { useMotionPreference } from '../motion/useMotionPreference'
import { hex, i32 } from '../core/isa'
import type { ModuleId } from '../core/trace/types'
import { useLabView } from '../stores/useLabStore'
import { MOTION, springStep, type SpringState } from '../motion/design'
import { presentationClock, timelineFor } from '../motion/timeline'
import { MODULES, POSITIONS, WIRES } from './topology'
import { SignalFlow } from './SignalFlow'
import { ModuleBlock } from './ModuleBlock'

import { ChipAsset } from './chip/ChipAsset'
import type { IntegratedChip } from './chip/model'

type Anchor = RefObject<HTMLDivElement | null>
const SPRING = (): SpringState => ({ position: 0, velocity: 0 })

function World({ labelHost, anchorRef }: { labelHost: HTMLDivElement; anchorRef: Anchor }) {
  const { scene, enter, trace, phase, viewVersion, cpu, playbackEpoch, inspection, playing } = useLabView()
  const reduced = useMotionPreference()
  const { camera, size, gl } = useThree()
  const spatial = useRef<Group>(null), model = useRef<Group>(null), board = useRef<Group>(null)
  const chip = useRef<IntegratedChip | null>(null)
  const blocks = useRef<(Group | null)[]>([])
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const reveal = useRef(SPRING())
  const anchorX = useRef(SPRING()), anchorY = useRef(SPRING()), scale = useRef({ position: 1, velocity: 0 })
  const escapeX = useRef({ position: 18, velocity: 0 }), escapeY = useRef({ position: 14, velocity: 0 })
  const anchor = useRef({ x: .4, y: 0, width: 800, height: 600 })
  const initialized = useRef(false), autoView = useRef(true)
  const transitionStarted = useRef(0)
  // Opt-in development stills for inspecting an actual reveal pose. No second
  // playback clock, no production override, and normal navigation is untouched.
  const captureProgress = useMemo(() => {
    if (!import.meta.env.DEV) return null
    const raw = new URLSearchParams(location.search).get('chip-inspect')
    return raw !== null && Number.isFinite(Number(raw)) ? Math.max(0, Math.min(1, Number(raw))) : null
  }, [])
  const open = scene === 'workbench'
  const timeline = useMemo(() => timelineFor(trace, phase), [trace, phase])
  const cameraHome = useMemo(() => new Vector3(10, -15, 23), [])
  const cameraPlane = useMemo(() => new Vector3(.5, -9, 28), [])
  const origin = useMemo(() => new Vector3(), []), projected = useMemo(() => new Vector3(), [])
  useLayoutEffect(() => { transitionStarted.current = performance.now() }, [scene, viewVersion])

  useEffect(() => {
    let previousScroll = window.scrollY
    const measure = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (rect) anchor.current = { x: (rect.x + rect.width / 2) / size.width * 2 - 1, y: 1 - (rect.y + rect.height / 2) / size.height * 2, width: rect.width, height: rect.height }
    }
    measure()
    const followScroll = () => {
      const delta = window.scrollY - previousScroll
      previousScroll = window.scrollY
      // Document scrolling is a coordinate-system translation, not a scene transition.
      // Follow it 1:1 at rest so a fast scroll never leaves the model trailing offscreen.
      if (initialized.current && Math.abs(reveal.current.position - (open ? 1 : 0)) < .005) anchorY.current.position += 2 * delta / size.height
      measure()
    }
    const observer = new ResizeObserver(measure)
    if (anchorRef.current) observer.observe(anchorRef.current)
    window.addEventListener('scroll', followScroll, { passive: true })
    window.addEventListener('resize', measure, { passive: true })
    return () => { observer.disconnect(); window.removeEventListener('scroll', followScroll); window.removeEventListener('resize', measure) }
  }, [anchorRef, scene, size.width, size.height])
  useEffect(() => { autoView.current = true; document.body.style.cursor = ''; return () => { document.body.style.cursor = '' } }, [scene, viewVersion])

  useFrame(({ clock }, dt) => {
    // The first render delta may include a long frame BEFORE the new target was
    // committed (e.g. GPU readback or context teardown). Integrate only time
    // spent under this target. Bound the presentation step after GPU stalls so
    // a heavy frame cannot skip the entire teardown or reassembly. This only
    // slows scene presentation under load; CPU commits and Trace time use their
    // existing independent semantics. Keep spring velocities on reversal.
    dt = Math.min(dt, .05, Math.max(0, (performance.now() - transitionStarted.current) / 1000))
    if (controls.current) controls.current.dampingFactor = 1 - Math.exp(-MOTION.orbitDamping * dt)
    const tState = reveal.current
    if (reduced) { tState.position = open ? 1 : 0; tState.velocity = 0 }
    else springStep(tState, open ? 1 : 0, dt)
    if (captureProgress !== null) { tState.position = captureProgress; tState.velocity = 0 }
    const t = tState.position
    if (autoView.current) {
      camera.position.lerp(open ? cameraPlane : cameraHome, reduced ? 1 : 1 - Math.exp(-MOTION.cameraResponse * dt))
      controls.current?.target.lerp(origin, reduced ? 1 : 1 - Math.exp(-MOTION.cameraResponse * dt))
      controls.current?.update()
      if (camera.position.distanceTo(open ? cameraPlane : cameraHome) < .001 && (controls.current?.target.length() ?? 0) < .001) autoView.current = false
    }
    camera.updateMatrixWorld()
    const distance = cameraHome.length() * (1 - t) + cameraPlane.length() * t
    const halfHeight = distance * Math.tan(40 * Math.PI / 360)
    const ppu = size.height / (2 * halfHeight)
    const targetScale = Math.min(anchor.current.width / (open ? 19 : 11.5), anchor.current.height / (open ? 13.5 : 11.5)) / ppu
    if (!initialized.current || reduced) {
      anchorX.current.position = anchor.current.x; anchorY.current.position = anchor.current.y; scale.current.position = targetScale
      initialized.current = true
    } else {
      springStep(anchorX.current, anchor.current.x, dt, MOTION.anchorOmega)
      springStep(anchorY.current, anchor.current.y, dt, MOTION.anchorOmega)
      springStep(scale.current, targetScale, dt, MOTION.anchorOmega)
    }
    if (spatial.current) {
      // Shift the optical center, keeping the world origin as OrbitControls' pivot.
      // Canvas size never changes between scenes; neither rotation nor zoom is cancelled.
      if (camera instanceof PerspectiveCamera) camera.setViewOffset(size.width, size.height, -anchorX.current.position * size.width / 2, anchorY.current.position * size.height / 2, size.width, size.height)
      spatial.current.scale.setScalar(scale.current.position)
      spatial.current.getWorldPosition(projected).project(camera)
      const root = labelHost.parentElement!
      root.dataset.reveal = t.toFixed(4)
      root.dataset.reducedMotion = String(reduced)
      root.dataset.compactLabels = String(anchor.current.height < 280)
      root.dataset.mediumLabels = String(anchor.current.height >= 280 && anchor.current.height < 360)
      root.dataset.renderTime = clock.elapsedTime.toFixed(4)
      if (import.meta.env.DEV) {
        root.dataset.drawCalls = String(gl.info.render.calls)
        root.dataset.triangles = String(gl.info.render.triangles)
        root.dataset.geometries = String(gl.info.memory.geometries)
        root.dataset.textures = String(gl.info.memory.textures)
      }
      root.dataset.camera = camera.position.toArray().map(n => n.toFixed(5)).join(',')
      root.dataset.anchorX = ((projected.x + 1) / 2 * size.width).toFixed(2)
      root.dataset.anchorY = ((1 - projected.y) / 2 * size.height).toFixed(2)
      const rect = anchorRef.current?.getBoundingClientRect()
      if (rect) root.style.clipPath = `inset(${Math.max(0, rect.top)}px ${Math.max(0, size.width - rect.right)}px ${Math.max(0, size.height - rect.bottom)}px ${Math.max(0, rect.left)}px)`
      const flowTime = presentationClock.read(playbackEpoch, inspection, timeline.duration)
      root.dataset.flowTime = flowTime.toFixed(4)
      root.dataset.playbackEpoch = String(playbackEpoch)
      root.dataset.flowPlaying = String(playing)
      root.dataset.flowRoutes = timeline.transfers.map(route => `${route.id}:${Math.max(0, Math.min(1, (flowTime - route.start) / (route.end - route.start))).toFixed(3)}`).join(',')
    }
    if (model.current) { model.current.position.z = reduced ? 0 : Math.sin(clock.elapsedTime * .65) * .09 * (1 - t); model.current.rotation.z = reduced ? 0 : Math.sin(clock.elapsedTime * .19) * .012 * (1 - t) }
    if (board.current) { board.current.visible = t > .001; board.current.scale.setScalar(.42 + .58 * t); board.current.position.z = -1.2 + 1.2 * t }
    if (chip.current) {
      const zoomPpu = size.height / (2 * camera.position.length() * Math.tan(40 * Math.PI / 360)) * scale.current.position
      springStep(escapeX.current, Math.max(18, anchor.current.width / (2 * zoomPpu) + 5), dt)
      springStep(escapeY.current, Math.max(14, anchor.current.height / (2 * zoomPpu) + 5), dt)
      chip.current.setExplodeProgress(t, escapeX.current.position, escapeY.current.position)
      const pose = chip.current.snapshot()
      const root = labelHost.parentElement!
      root.dataset.coverOpacity = pose.opacity.toFixed(4)
      root.dataset.coverDistance = pose.distance.map(n => n.toFixed(3)).join(',')
      root.dataset.chipVisible = String(pose.visible)
      root.dataset.chipPose = [...pose.cover, ...pose.brand].map(n => n.toFixed(6)).join(',')
    }
    blocks.current.forEach((block, i) => { const p = POSITIONS[MODULES[i].id]; block?.position.set(p[0] * (.32 + .68 * t), p[1] * (.32 + .68 * t), .35) })
    spatial.current?.updateMatrixWorld(true)
  }, -.5) // After OrbitControls (-1), before Drei Html projection (0).

  const valueFor = (id: ModuleId) => {
    const s = trace?.signals
    if (!s) return id === 'pc' ? hex(cpu.pc) : '待执行'
    switch (id) {
      case 'pc': return hex(phase === 'writeback' ? s.next_pc : s.pc_value)
      case 'imem': return hex(s.imem_rdata)
      case 'decoder': return `B_imm=${s.alu_b_imm} · WE=${s.reg_write}`
      case 'imm': return `${i32(s.imm)}`
      case 'regfile': return phase === 'writeback' && s.reg_write ? `x${trace.write.rd} ← ${i32(s.wb_data)}` : `x${trace.instruction.rs1} → ${i32(s.rs1_data)}`
      case 'mux': return `${i32(s.alu_b)}`
      case 'alu': return `${i32(s.alu_a)} + ${i32(s.alu_b)} = ${i32(s.alu_result)}`
      case 'wb': return `${i32(s.wb_data)}`
      case 'dmem': return trace.memoryAccess ? `${trace.memoryAccess.kind === 'load' ? 'R' : 'W'} [${s.dmem_addr}] = ${i32(trace.memoryAccess.data)}` : '未访问'
      case 'branch': return s.branch ? `${i32(s.rs1_data)} = ${i32(s.rs2_data)} ? ${s.branch_taken}` : '未参与'
      case 'nextpc': return hex(s.next_pc)
    }
  }

  return <>
    <ambientLight intensity={1.3} /><directionalLight position={[4, -5, 10]} intensity={1.8} />
    <group ref={spatial}><group ref={model}>
      <group ref={board}>
        <mesh position={[0, 0, -.28]}><boxGeometry args={[16.3, 10.2, .26]} /><meshStandardMaterial color="#141d28" roughness={.85} /><Edges color="#526171" /></mesh>
        {Array.from({ length: 4 }, (_, i) => <mesh key={i} position={[i % 2 ? 7.7 : -7.7, i < 2 ? -4.7 : 4.7, -.1]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[.09, .09, .03, 12]} /><meshBasicMaterial color="#8594a6" /></mesh>)}
        {WIRES.map(wire => <SignalFlow key={wire.id} wire={wire} transfer={timeline.transfers.find(t => t.id === wire.id)} timeline={timeline} epoch={playbackEpoch} inspection={inspection} reduced={reduced} />)}
        {MODULES.map((module, i) => <group key={module.id} ref={el => { blocks.current[i] = el }}><ModuleBlock module={module} labelHost={labelHost} value={valueFor(module.id)} reveal={reveal.current} timeline={timeline} epoch={playbackEpoch} inspection={inspection} reduced={reduced} open={open} /></group>)}
      </group>
      <group onClick={event => { event.stopPropagation(); if (!open && event.delta <= 4) enter() }} onPointerOver={() => { if (!open) document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
        <ChipAsset model={chip} host={labelHost.parentElement!} />
      </group>
      <Html portal={{ current: labelHost }} center position={[0, 0, .6]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}><span className="chip-hit-anchor" aria-label="芯生 V2 芯片" style={{ display: 'block', width: 1, height: 1 }} /></Html>
    </group></group>
    <OrbitControls ref={controls} domElement={anchorRef.current ?? undefined} makeDefault enableDamping dampingFactor={.075} minDistance={18} maxDistance={44} minPolarAngle={.12} maxPolarAngle={Math.PI / 2.15} onStart={() => { autoView.current = false }} />
  </>
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="scene-fallback">三维场景暂不可用。仍可通过程序、信号面板与寄存器观察完整执行结果。</div> : this.props.children }
}

export default function CpuScene({ anchorRef }: { anchorRef: Anchor }) {
  const [labelHost, setLabelHost] = useState<HTMLDivElement | null>(null)
  return <SceneBoundary><Suspense fallback={<div className="scene-fallback">正在建立三维场景…</div>}><div className="scene-root" data-testid="scene-root">
    <Canvas eventSource={anchorRef} eventPrefix="client" camera={{ position: [10, -15, 23], up: [0, 0, 1], fov: 40 }} dpr={[1, 1.5]} gl={{ antialias: true, alpha: true }} aria-label="可旋转的三维 CPU 数据通路" fallback={<div className="scene-fallback">如设备无法显示 WebGL 场景，可继续使用 CPU 操作与信号面板。</div>}>
      {labelHost && <World labelHost={labelHost} anchorRef={anchorRef} />}
    </Canvas><div ref={setLabelHost} className="scene-label-host" />
  </div></Suspense></SceneBoundary>
}
