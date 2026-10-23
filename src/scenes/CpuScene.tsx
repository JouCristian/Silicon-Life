import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import { Group, PerspectiveCamera, Vector3, type WebGLRenderer } from 'three'
import { useMotionPreference } from '../motion/useMotionPreference'
import { hex, i32 } from '../core/isa'
import type { ModuleId } from '../core/trace/types'
import { useLabView } from '../stores/useLabStore'
import { MOTION, smoothstep, springStep, type SpringState } from '../motion/design'
import { presentationClock, timelineFor } from '../motion/timeline'
import { MODULES, POSITIONS, WIRES } from './topology'
import { SignalFlow } from './SignalFlow'
import { ModuleBlock } from './ModuleBlock'

import { ChipAsset } from './chip/ChipAsset'
import { StudioEnvironment } from './chip/StudioEnvironment'
import { cameraPathEase, cinematicEase } from './chip/cinematic'
import type { IntegratedChip } from './chip/model'
import { TeachingBoard } from './teaching/TeachingBoard'
import { PeripheralDisplay } from './PeripheralDisplay'
import { ALU_LABELS } from '../core/cpu'
import { usePeripheralStore } from '../stores/usePeripheralStore'
import { useExplorationStore } from '../stores/useExplorationStore'
import { type ExplorerId } from './exploration/model'
import { ModuleInterior } from './exploration/ModuleInterior'
import { explorationDistance } from './exploration/camera'

type Anchor = RefObject<HTMLDivElement | null>
const SPRING = (): SpringState => ({ position: 0, velocity: 0 })
// A full open/close is deliberately slow enough to read every mechanical layer.
// The lead-in is anticipation; the cubic-bezier then carries the long settle.
const REVEAL_LEAD = .12
// Hardware gets the full cinematic runway. Software/CI uses the same staged
// curves with a shorter runway so slow frame times cannot delay the completed
// state beyond the established reveal assertions.
const REVEAL_DURATION_GPU = 2.9
const REVEAL_DURATION_COMPAT = 1.6
const CAMERA_RESPONSE = 3.2
const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

/** GPU screens get the full PBR environment. SwiftShader/llvmpipe gets the same
 * geometry and motion through a matcap so software CI and no-GPU machines can
 * still render 16+ frames during the transition. */
function isSoftwareRenderer(renderer: WebGLRenderer): boolean {
  try {
    const context = renderer.getContext()
    const extension = context.getExtension('WEBGL_debug_renderer_info')
    const name = extension ? String(context.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : ''
    return /swiftshader|llvmpipe|software/i.test(name)
  } catch {
    return false
  }
}

function World({ labelHost, anchorRef }: { labelHost: HTMLDivElement; anchorRef: Anchor }) {
  const { scene, enter, trace, phase, viewVersion, cpu, playbackEpoch, inspection, playing } = useLabView()
  const peripheralInstalled = usePeripheralStore(state => state.installed.includes('display'))
  const focusedPeripheral = usePeripheralStore(state => state.focused)
  const focusPeripheral = usePeripheralStore(state => state.focus)
  const explored = useExplorationStore(state => state.selected)
  const explore = useExplorationStore(state => state.enter)
  const exitExploration = useExplorationStore(state => state.exit)
  const [interiorId, setInteriorId] = useState<ExplorerId | null>(null)
  const interiorProgress = useRef(SPRING())
  const interiorAnchor = useRef<Group>(null)
  const returnEye = useMemo(() => new Vector3(), [])
  const returnTarget = useMemo(() => new Vector3(), [])
  const interiorTarget = useMemo(() => new Vector3(), [])
  const interiorEye = useMemo(() => new Vector3(), [])
  const lastCameraOwner = useRef<'display' | 'module' | null>(null)
  const reduced = useMotionPreference()
  const { camera, size, gl } = useThree()
  const softwareRenderer = useMemo(() => isSoftwareRenderer(gl), [gl])
  const materialMode = softwareRenderer ? 'matcap' as const : 'pbr' as const
  const revealDuration = softwareRenderer ? REVEAL_DURATION_COMPAT : REVEAL_DURATION_GPU
  const spatial = useRef<Group>(null), model = useRef<Group>(null), board = useRef<Group>(null)
  const chip = useRef<IntegratedChip | null>(null)
  const blocks = useRef<(Group | null)[]>([])
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const displayAnchor = useRef<Group>(null)
  const focusTarget = useMemo(() => new Vector3(), [])
  const focusEye = useMemo(() => new Vector3(0, -.12, 8.2), [])
  const reveal = useRef(SPRING())
  const revealTween = useRef({ from: 0, to: 0, elapsed: 0, duration: 0, active: false })
  const anchorX = useRef(SPRING()), anchorY = useRef(SPRING()), scale = useRef({ position: 1, velocity: 0 })
  const escapeX = useRef({ position: 18, velocity: 0 }), escapeY = useRef({ position: 14, velocity: 0 })
  const anchor = useRef({ x: .4, y: 0, width: 800, height: 600 })
  const initialized = useRef(false), autoView = useRef(true)
  const transitionStarted = useRef(0)
  const warmFrames = useRef(0)
  // Opt-in development stills for inspecting an actual reveal pose. No second
  // playback clock, no production override, and normal navigation is untouched.
  const captureProgress = useMemo(() => {
    if (!import.meta.env.DEV) return null
    const raw = new URLSearchParams(location.search).get('chip-inspect')
    return raw !== null && Number.isFinite(Number(raw)) ? Math.max(0, Math.min(1, Number(raw))) : null
  }, [])
  const open = scene === 'workbench'
  const timeline = useMemo(() => timelineFor(trace, phase), [trace, phase])
  const cameraHome = useMemo(() => new Vector3(10.6, -14.2, 22.4), [])
  // The teaching view is deliberately more head-on than the hero shot: it keeps
  // the module labels and copper routes legible while retaining the 2.5D depth.
  const cameraPlane = useMemo(() => new Vector3(.6, -6.4, 26.2), [])
  const origin = useMemo(() => new Vector3(), []), projected = useMemo(() => new Vector3(), [])
  const cameraPoint = useMemo(() => new Vector3(), [])
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
  useEffect(() => {
    autoView.current = focusedPeripheral !== 'display'
  }, [focusedPeripheral])
  useEffect(() => {
    if (!open && focusedPeripheral) focusPeripheral(null)
  }, [open, focusedPeripheral, focusPeripheral])
  useLayoutEffect(() => {
    if (!explored) return
    if (interiorProgress.current.position < .001) {
      returnEye.copy(lastCameraOwner.current === 'display' ? cameraPlane : camera.position)
      returnTarget.copy(lastCameraOwner.current === 'display' ? origin : controls.current?.target ?? origin)
    }
    setInteriorId(explored)
  }, [explored, camera, cameraPlane, origin, returnEye, returnTarget])
  useEffect(() => {
    exitExploration()
    returnEye.copy(cameraPlane); returnTarget.copy(origin)
  }, [scene, viewVersion, exitExploration, cameraPlane, origin, returnEye, returnTarget])

  useFrame(({ clock }, dt) => {
    // The first render delta may include a long frame BEFORE the new target was
    // committed (e.g. GPU readback or context teardown). Integrate only time
    // spent under this target. Bound the presentation step after GPU stalls so
    // a heavy frame cannot skip the entire teardown or reassembly. This only
    // slows scene presentation under load; CPU commits and Trace time use their
    // existing independent semantics. Keep spring velocities on reversal.
    dt = Math.min(dt, .05, Math.max(0, (performance.now() - transitionStarted.current) / 1000))
    if (controls.current) controls.current.dampingFactor = 1 - Math.exp(-MOTION.orbitDamping * dt)
    const target = open ? 1 : 0
    const tState = reveal.current
    if (captureProgress !== null) {
      tState.position = captureProgress
      tState.velocity = 0
      revealTween.current.to = target
      revealTween.current.active = false
    } else if (reduced) {
      tState.position = target
      tState.velocity = 0
      revealTween.current.to = target
      revealTween.current.active = false
    } else {
      if (target !== revealTween.current.to) {
        const from = tState.position
        const distance = Math.abs(target - from)
        revealTween.current = {
          from,
          to: target,
          elapsed: 0,
          // Full travel takes ~2.9s (1.6s compat). Reversals inherit a shorter distance, but
          // retain a minimum runway so the layers never snap.
          duration: REVEAL_LEAD + revealDuration * Math.max(.42, distance),
          active: true,
        }
      }
      const tween = revealTween.current
      if (tween.active) {
        tween.elapsed += dt
        const raw = clamp01((tween.elapsed - REVEAL_LEAD) / Math.max(.001, tween.duration - REVEAL_LEAD))
        tState.position = tween.from + (tween.to - tween.from) * cinematicEase(raw)
        tState.velocity = 0
        if (raw >= 1) {
          tState.position = tween.to
          tween.active = false
        }
      }
    }
    const t = tState.position
    const interior = interiorProgress.current
    if (reduced) { interior.position = open && explored ? 1 : 0; interior.velocity = 0 }
    else springStep(interior, open && explored ? 1 : 0, dt, 7)
    const interiorVisible = interiorId && interior.position > .001
    labelHost.dataset.exploring = interiorVisible ? interiorId : ''
    labelHost.parentElement!.dataset.exploring = explored ?? ''
    labelHost.parentElement!.dataset.exploreProgress = interior.position.toFixed(4)
    const displayFocus = open && peripheralInstalled && focusedPeripheral === 'display' && displayAnchor.current
    if (!open) lastCameraOwner.current = null
    if (controls.current) controls.current.enabled = !displayFocus && !explored && !interiorVisible && lastCameraOwner.current !== 'module'
    if (displayFocus) {
      displayAnchor.current!.getWorldPosition(focusTarget)
      cameraPoint.copy(focusTarget).add(focusEye)
      const follow = reduced ? 1 : 1 - Math.exp(-CAMERA_RESPONSE * dt)
      camera.position.lerp(cameraPoint, follow)
      controls.current?.target.lerp(focusTarget, follow)
      controls.current?.update()
      autoView.current = false
      lastCameraOwner.current = 'display'
    } else if (open && (interiorVisible || explored)) {
      interiorAnchor.current?.getWorldPosition(interiorTarget)
      const distance = explorationDistance(scale.current.position, anchor.current.width, anchor.current.height, size.height)
      interiorEye.copy(interiorTarget)
      interiorEye.y -= distance * .14; interiorEye.z += distance
      const blend = clamp01(interior.position), follow = reduced ? 1 : 1 - Math.exp(-CAMERA_RESPONSE * dt)
      cameraPoint.copy(returnEye).lerp(interiorEye, blend)
      focusTarget.copy(returnTarget).lerp(interiorTarget, blend)
      camera.position.lerp(cameraPoint, follow)
      controls.current?.target.lerp(focusTarget, follow)
      controls.current?.update()
      autoView.current = false
      lastCameraOwner.current = 'module'
    } else if (open && lastCameraOwner.current === 'module') {
      const follow = reduced ? 1 : 1 - Math.exp(-CAMERA_RESPONSE * dt)
      camera.position.lerp(returnEye, follow)
      controls.current?.target.lerp(returnTarget, follow)
      controls.current?.update()
      if (camera.position.distanceTo(returnEye) < .003 && (controls.current?.target.distanceTo(returnTarget) ?? 0) < .003) lastCameraOwner.current = null
    } else if (autoView.current) {
      // The camera target travels on a later, gently overshooting Bezier path;
      // the camera itself still follows with frame-rate-independent damping.
      const pathT = cameraPathEase(clamp01((t - .14) / .8))
      const arc = Math.sin(Math.PI * clamp01(pathT))
      cameraPoint.copy(cameraHome).lerp(cameraPlane, pathT)
      cameraPoint.y += arc * .55
      cameraPoint.x += arc * .16
      const follow = reduced ? 1 : 1 - Math.exp(-CAMERA_RESPONSE * dt)
      camera.position.lerp(cameraPoint, follow)
      controls.current?.target.lerp(origin, follow)
      controls.current?.update()
      if (t >= .9999 && camera.position.distanceTo(cameraPlane) < .003 && (controls.current?.target.length() ?? 0) < .001) { autoView.current = false; lastCameraOwner.current = null }
    }
    camera.updateMatrixWorld()
    const distance = cameraHome.length() * (1 - t) + cameraPlane.length() * t
    const halfHeight = distance * Math.tan(40 * Math.PI / 360)
    const ppu = size.height / (2 * halfHeight)
    const targetScale = Math.min(anchor.current.width / (open ? (peripheralInstalled ? 23.4 : 18.3) : 10.5), anchor.current.height / (open ? (peripheralInstalled ? 12.35 : 11.75) : 10.4)) / ppu
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
      root.dataset.renderQuality = softwareRenderer ? 'compat' : 'pbr'
      root.dataset.compactLabels = String(anchor.current.height < 280)
      root.dataset.mediumLabels = String(anchor.current.height >= 280 && anchor.current.height < 360)
      root.dataset.peripheralInstalled = String(peripheralInstalled)
      root.dataset.peripheralFocus = focusedPeripheral === 'display' ? 'display' : ''
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
    const boardT = smoothstep(.08, .9, t)
    const boardDepthT = smoothstep(.15, .5, t)
    if (board.current) {
      if (!softwareRenderer && warmFrames.current < 2) {
        // Draw the parked board through the normal R3F pass for two frames so
        // its shaders and 12 CanvasTextures are uploaded before the first click.
        // Software/CI skips this pre-roll so the background and tests are not
        // blocked by a texture-upload burst during startup.
        board.current.visible = true
        board.current.scale.setScalar(.0001)
        board.current.position.set(0, 0, -2)
        warmFrames.current += 1
      } else {
        board.current.visible = t > .001
        board.current.scale.setScalar(.42 + .58 * boardT)
        board.current.position.z = -1.2 + 1.2 * boardDepthT
      }
    }
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
    const layoutT = smoothstep(.14, .88, t)
    blocks.current.forEach((block, i) => { const p = POSITIONS[MODULES[i].id]; block?.position.set(p[0] * (.32 + .68 * layoutT), p[1] * (.32 + .68 * layoutT), .35) })
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
      case 'regfile': return phase === 'writeback' && s.reg_write ? trace.write.committed ? `x${trace.write.rd} ← ${i32(s.wb_data)}` : 'x0 · 丢弃写回' : `x${trace.word >>> 15 & 31} → ${i32(s.rs1_data)}`
      case 'mux': return `${i32(s.alu_b)}`
      case 'alu': return `${ALU_LABELS[s.alu_op]}(${i32(s.alu_a)}, ${i32(s.alu_b)}) = ${i32(s.alu_result)}`
      case 'wb': return `${i32(s.wb_data)}`
      case 'dmem': return trace.memoryAccess?.space === 'mmio' ? 'MMIO → 显示设备（RAM 未写入）' : trace.memoryAccess ? `${trace.memoryAccess.kind === 'load' ? 'R' : 'W'} [${s.dmem_addr}] = ${i32(trace.memoryAccess.data)}` : '未访问'
      case 'branch': return s.branch ? `${trace.instruction.op}(${hex(s.rs1_data)}, ${hex(s.rs2_data)}) → ${s.branch_taken}` : '未参与'
      case 'nextpc': return hex(s.next_pc)
    }
  }

  return <>
    <StudioEnvironment enabled={!softwareRenderer} />
    <ambientLight intensity={.18} />
    <hemisphereLight args={['#acc9dd', '#07090c', .46]} />
    <directionalLight position={[7, -8, 13]} intensity={1.8} color="#f2f7ff" />
    <directionalLight position={[-8, 7, 9]} intensity={1.45} color="#78b2e2" />
    <directionalLight position={[0, 3, 20]} intensity={1.0} color="#d8ecf8" />
    <pointLight position={[0, -3, 8]} intensity={12} distance={34} decay={2} color="#b6d6ef" />
    <group ref={spatial}><group ref={model}>
      <group ref={board}>
        <TeachingBoard />
        {WIRES.map(wire => <SignalFlow key={wire.id} wire={wire} transfer={timeline.transfers.find(t => t.id === wire.id)} timeline={timeline} epoch={playbackEpoch} inspection={inspection} reduced={reduced} />)}
        {MODULES.map((module, i) => <group key={module.id} ref={el => { blocks.current[i] = el }}><ModuleBlock module={module} labelHost={labelHost} value={valueFor(module.id)} reveal={reveal.current} timeline={timeline} epoch={playbackEpoch} inspection={inspection} reduced={reduced} open={open} exploration={interiorId === module.id ? interiorProgress.current : undefined} onExplore={() => explore(module.id)} /></group>)}
        {interiorId && <ModuleInterior id={interiorId} progress={interiorProgress.current} labelHost={labelHost} anchor={interiorAnchor} />}
        <PeripheralDisplay screenAnchor={displayAnchor} />
      </group>
      <group onClick={event => { event.stopPropagation(); if (!open && event.delta <= 4) enter() }} onPointerOver={() => { if (!open) document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
        <ChipAsset model={chip} host={labelHost.parentElement!} materialMode={materialMode} />
      </group>
      <Html portal={{ current: labelHost }} center position={[0, 0, .6]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}><span className="chip-hit-anchor" aria-label="芯生 V3 芯片" style={{ display: 'block', width: 1, height: 1 }} /></Html>
    </group></group>
    <OrbitControls ref={controls} domElement={anchorRef.current ?? undefined} makeDefault enableDamping dampingFactor={.075} minDistance={3.2} maxDistance={44} minPolarAngle={.12} maxPolarAngle={Math.PI / 2.15} enableRotate={focusedPeripheral !== 'display'} enablePan={focusedPeripheral !== 'display'} enableZoom={focusedPeripheral !== 'display'} onStart={() => { autoView.current = false }} />
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
