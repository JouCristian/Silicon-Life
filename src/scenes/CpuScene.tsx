import { Component, Suspense, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Html, Line, OrbitControls } from '@react-three/drei'
import { Group, Vector3 } from 'three'
import { useReducedMotion } from 'motion/react'
import { hex, i32 } from '../core/isa'
import type { ModuleId } from '../core/trace/types'
import { MODULES, POSITIONS, WIRES, type Point } from './topology'
import { useLabView } from '../stores/useLabStore'

const INK = '#a8afb9'
const BLUE = '#91bcff'
function Packet({ points, visible, reduced }: { points: Point[]; visible: boolean; reduced: boolean }) {
  const ref = useRef<Group>(null)
  const path = points.map(p => new Vector3(p[0], p[1], .13))
  const lengths = path.slice(1).map((p, i) => p.distanceTo(path[i]))
  const total = lengths.reduce((a, b) => a + b, 0)
  useFrame(({ clock }) => {
    if (!ref.current || !visible) return
    let distance = (reduced ? .5 : (clock.elapsedTime * .8) % 1) * total
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i]) { ref.current.position.lerpVectors(path[i], path[i + 1], distance / lengths[i]); break }
      distance -= lengths[i]
    }
  })
  return <group ref={ref} visible={visible}><mesh><sphereGeometry args={[.055, 10, 8]} /><meshBasicMaterial color={BLUE} /></mesh></group>
}

function ViewControls({ version, open, reduced }: { version: number; open: boolean; reduced: boolean }) {
  const ref = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera, size } = useThree()
  const target = useRef(new Vector3(10, -15, 20))
  const settling = useRef(true)
  useEffect(() => {
    camera.up.set(0, 0, 1)
    // Keep the teaching plane nearly frontal so labels and buses remain legible.
    const distance = Math.max(17, 27 / (size.width / size.height))
    target.current.set(...(open ? [.5, -distance * .35, distance] : [10, -15, 20]) as Point)
    settling.current = true
    ref.current?.target.set(0, 0, 0)
  }, [camera, version, open, size.width, size.height])
  useFrame((_, dt) => {
    if (!settling.current) return
    camera.position.lerp(target.current, reduced ? 1 : 1 - Math.exp(-5 * dt))
    ref.current?.update()
    if (camera.position.distanceTo(target.current) < .01) settling.current = false
  })
  return <OrbitControls ref={ref} makeDefault enableDamping dampingFactor={.09} minDistance={10} maxDistance={40} minPolarAngle={.1} maxPolarAngle={Math.PI / 2.15} onStart={() => { settling.current = false }} />
}

function World({ labelHost }: { labelHost: HTMLDivElement }) {
  const { scene, enter, trace, phase, viewVersion, cpu } = useLabView()
  const reduced = !!useReducedMotion()
  const board = useRef<Group>(null)
  const cover = useRef<Group>(null)
  const blocks = useRef<(Group | null)[]>([])
  const progress = useRef(0)
  const velocity = useRef(0)
  const [revealed, setRevealed] = useState(false)
  const open = scene === 'workbench'
  const active = trace?.phases[phase] ?? []
  useEffect(() => {
    document.body.style.cursor = ''
    if (!open) setRevealed(false)
    return () => { document.body.style.cursor = '' }
  }, [open])

  useFrame((_, delta) => {
    const target = open ? 1 : 0
    const dt = Math.min(delta, .033)
    // Critically damped spring: continuous position, no layout work per frame.
    velocity.current += ((target - progress.current) * 48 - velocity.current * 14) * dt
    progress.current = reduced ? target : Math.max(0, Math.min(1, progress.current + velocity.current * dt))
    const t = progress.current
    if (board.current) { board.current.scale.setScalar(.42 + .58 * t); board.current.position.z = -1.2 + 1.2 * t }
    if (cover.current) {
      cover.current.visible = t < .995
      cover.current.children.forEach((child, i) => {
        child.position.set((i % 2 === 0 ? -1 : 1) * (1.8 + t * 11), (i < 2 ? -1 : 1) * (1.8 + t * 8), 1.15 + t * 6)
        child.rotation.set(t * .2 * (i % 2 ? 1 : -1), t * .35, 0)
      })
    }
    blocks.current.forEach((block, i) => {
      if (!block) return
      const p = POSITIONS[MODULES[i].id]
      block.position.set(p[0] * (.32 + .68 * t), p[1] * (.32 + .68 * t), .35)
    })
    if (t > .97 && open && !revealed) setRevealed(true)
  })

  const valueFor = (id: ModuleId) => {
    const s = trace?.signals
    if (!s) return id === 'pc' ? hex(cpu.pc) : '待执行'
    switch (id) {
      case 'pc': return hex(phase === 'writeback' ? s.next_pc : s.pc_value)
      case 'imem': return hex(s.imem_rdata)
      case 'decoder': return `alu_b_imm = ${s.alu_b_imm}`
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
    <ambientLight intensity={1.8} />
    <directionalLight position={[4, -5, 10]} intensity={2} />
    <group ref={board}>
      <mesh position={[0, 0, -.28]}>
        <boxGeometry args={[16.3, 10.2, .26]} />
        <meshStandardMaterial color="#11161d" roughness={.85} />
        <Edges color="#404854" />
      </mesh>
      {Array.from({ length: 4 }, (_, i) => <mesh key={i} position={[i % 2 ? 7.5 : -7.5, i < 2 ? -3.9 : 3.9, -.1]}><cylinderGeometry args={[.09, .09, .03, 16]} /><meshBasicMaterial color="#6d7681" /></mesh>)}
      {WIRES.map(wire => {
        const on = revealed && !!trace?.transfers.some(t => t.id === wire.id && t.phase === phase)
        return <group key={wire.id}>
          <Line points={wire.points.map(p => [p[0], p[1], .1] as Point)} color={on ? BLUE : '#424b59'} lineWidth={on ? 2 : 1} dashed={wire.control} dashSize={.12} gapSize={.08} />
          <Packet points={wire.points} visible={on} reduced={reduced} />
        </group>
      })}
      {MODULES.map((module, i) => {
        const on = revealed && active.includes(module.id)
        return <group key={module.id} ref={el => { blocks.current[i] = el }}>
          <mesh>
            <boxGeometry args={[module.width, 1.3, .48]} />
            <meshStandardMaterial color={on ? '#1c3554' : '#1b222b'} roughness={.65} metalness={.2} />
            <Edges color={on ? BLUE : INK} />
          </mesh>
          <mesh position={[0, 0, .25]}><boxGeometry args={[module.width - .15, 1.14, .025]} /><meshBasicMaterial color={on ? '#172d47' : '#151c25'} wireframe /></mesh>
          {revealed && <Html portal={{ current: labelHost }} center position={[0, 0, .4]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`module-label ${on ? 'active' : ''}`}>
              <b>{module.title}</b><span>{module.sub}</span><code>{valueFor(module.id)}</code>
            </div>
          </Html>}
        </group>
      })}
      {revealed && <>
        <Html portal={{ current: labelHost }} center position={[-5.7, 3.15, .1]} zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}><span className="wire-label">PC + 4</span></Html>
        <Html portal={{ current: labelHost }} center position={[3.8, -3.6, .1]} zIndexRange={[7, 0]} style={{ pointerEvents: 'none' }}><span className="wire-label">wb_data · 写回总线</span></Html>
      </>}
    </group>
    <group ref={cover} onClick={event => { event.stopPropagation(); if (!open) enter() }} onPointerOver={() => { if (!open) document.body.style.cursor = 'pointer' }} onPointerOut={() => { document.body.style.cursor = '' }}>
      {[0, 1, 2, 3].map(i => <group key={i} position={[i % 2 === 0 ? -1.8 : 1.8, i < 2 ? -1.8 : 1.8, 1.15]}>
        <mesh><boxGeometry args={[3.6, 3.6, .7]} /><meshStandardMaterial color="#14191f" transparent opacity={.92} /><Edges color="#a8afb9" /></mesh>
        <mesh position={[0, 0, .36]}><boxGeometry args={[3.6, 3.6, .01, 6, 6]} /><meshBasicMaterial color="#626c78" wireframe /></mesh>
        {Array.from({ length: 8 }, (_, n) => <group key={n}>
          <mesh position={[i % 2 === 0 ? -2 : 2, -1.55 + n * .44, -.1]}><boxGeometry args={[.4, .14, .18]} /><meshBasicMaterial color="#39414d" /><Edges color="#b0b6bf" /></mesh>
          <mesh position={[-1.55 + n * .44, i < 2 ? -2 : 2, -.1]}><boxGeometry args={[.14, .4, .18]} /><meshBasicMaterial color="#39414d" /><Edges color="#b0b6bf" /></mesh>
        </group>)}
      </group>)}
    </group>
    {!open && <Html portal={{ current: labelHost }} center position={[0, 0, 1.6]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}><div className="die-mark">芯生<span>RV32I / SILICON LIFE</span></div></Html>}
    <ViewControls version={viewVersion} open={open} reduced={reduced} />
  </>
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <div className="scene-fallback">三维场景暂不可用。仍可通过程序、信号面板与寄存器观察完整执行结果。</div> : this.props.children }
}

export default function CpuScene() {
  const [labelHost, setLabelHost] = useState<HTMLDivElement | null>(null)
  return <SceneBoundary><Suspense fallback={<div className="scene-fallback">正在建立三维场景…</div>}>
    <div className="scene-root">
      <Canvas camera={{ position: [10, -15, 20], up: [0, 0, 1], fov: 40 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} aria-label="可旋转的三维 CPU 数据通路" fallback={<div className="scene-fallback">如设备无法显示 WebGL 场景，可继续使用 CPU 操作与信号面板。</div>}>
        {labelHost && <World labelHost={labelHost} />}
      </Canvas>
      <div ref={setLabelHost} className="scene-label-host" />
    </div>
  </Suspense></SceneBoundary>
}
