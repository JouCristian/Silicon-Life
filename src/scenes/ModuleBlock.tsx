import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html } from '@react-three/drei'
import { Color, Group, MeshStandardMaterial } from 'three'
import type { ModuleId } from '../core/trace/types'
import { MOTION, smoothstep, type SpringState } from '../motion/design'
import { presentationClock, type Timeline } from '../motion/timeline'
import type { MODULES } from './topology'

const BASE = new Color('#202b38')
const COLORS = { data: new Color(MOTION.color.data), control: new Color(MOTION.color.control), writeback: new Color(MOTION.color.writeback) }
const SURFACES = { data: BASE.clone().lerp(COLORS.data, .2), control: BASE.clone().lerp(COLORS.control, .2), writeback: BASE.clone().lerp(COLORS.writeback, .2) }
const SHORT: Record<ModuleId, string> = { pc: 'PC', imem: 'IMEM', decoder: 'DEC', regfile: 'RF', imm: 'IMM', mux: 'MUX', alu: 'ALU', wb: 'WB', dmem: 'DMEM', branch: 'BR', nextpc: 'NPC' }

export function ModuleBlock({ module, labelHost, value, reveal, timeline, epoch, inspection, reduced, open }: {
  module: typeof MODULES[number]; labelHost: HTMLDivElement; value: string; reveal: SpringState; timeline: Timeline;
  epoch: number; inspection: boolean; reduced: boolean; open: boolean
}) {
  const material = useRef<MeshStandardMaterial>(null)
  const body = useRef<Group>(null)
  const label = useRef<HTMLDivElement>(null)
  useFrame(() => {
    const time = presentationClock.read(epoch, inspection, timeline.duration)
    const outgoing = timeline.transfers.filter(t => t.from === module.id && time >= t.start)
    const incoming = timeline.transfers.filter(t => t.to === module.id && time >= t.end)
    const signal = incoming.at(-1) ?? outgoing.at(-1)
    // Analytic damped impulse, evaluated in logical time so pause freezes it too.
    const impulse = (age: number) => age < 0 ? 0 : 18 * age * Math.exp(1 - 18 * age)
    const response = incoming.reduce((n, t) => Math.max(n, impulse(time - t.end)), 0)
    const emission = outgoing.reduce((n, t) => Math.max(n, impulse(time - t.start)), 0)
    const active = !!signal
    if (material.current) {
      material.current.color.copy(active ? SURFACES[signal.kind] : BASE)
      material.current.emissive.copy(active ? COLORS[signal.kind] : BASE)
      material.current.emissiveIntensity = active ? .025 + response * .07 + emission * .04 : 0
    }
    if (body.current) { body.current.position.z = reduced ? 0 : response * .055; body.current.scale.setScalar(reduced ? 1 : 1 + response * .012) }
    if (label.current) {
      label.current.style.opacity = String(smoothstep(.45, .88, reveal.position))
      label.current.style.color = active ? MOTION.color[signal.kind] : '#eef3f9'
      label.current.dataset.responding = active ? 'true' : 'false'
    }
  })
  return <>
    <group ref={body}>
      <mesh><boxGeometry args={[module.width, 1.3, .48]} /><meshStandardMaterial ref={material} color="#202b38" roughness={.62} metalness={.22} /><Edges color="#9baab9" /></mesh>
      <mesh position={[0, 0, .25]}><boxGeometry args={[module.width - .15, 1.14, .025]} /><meshBasicMaterial color="#5d718a" wireframe transparent opacity={.22} /></mesh>
    </group>
    <Html portal={{ current: labelHost }} center position={[0, 0, .43]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={label} className="module-label" data-module={module.id as ModuleId} aria-hidden={!open} style={{ opacity: 0 }}><b className="module-full">{module.title}</b><b className="module-short" aria-label={module.title}>{SHORT[module.id]}</b><span>{module.sub}</span><code>{value}</code></div>
    </Html>
  </>
}
