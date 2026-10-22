import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html } from '@react-three/drei'
import { AdditiveBlending, Color, Group, MeshBasicMaterial, MeshPhysicalMaterial } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { ModuleId } from '../core/trace/types'
import { MOTION, smoothstep, type SpringState } from '../motion/design'
import { presentationClock, type Timeline } from '../motion/timeline'
import { createModuleFaceTexture } from './teaching/moduleTextures'
import { MODULES } from './topology'

const BASE = new Color('#162630')
const FACE_BASE = new Color('#c2d7e0')
const STATUS_IDLE = new Color('#355563')
const COLORS = { data: new Color(MOTION.color.data), control: new Color(MOTION.color.control), writeback: new Color(MOTION.color.writeback) }
const SURFACES = {
  data: BASE.clone().lerp(COLORS.data, .24),
  control: BASE.clone().lerp(COLORS.control, .24),
  writeback: BASE.clone().lerp(COLORS.writeback, .24),
}
const SHORT: Record<ModuleId, string> = { pc: 'PC', imem: 'IMEM', decoder: 'DEC', regfile: 'RF', imm: 'IMM', mux: 'MUX', alu: 'ALU', wb: 'WB', dmem: 'DMEM', branch: 'BR', nextpc: 'NPC' }
// The instruction and register-file blocks share a row; a small opposed offset
// keeps their HTML labels from touching without moving either teaching datum.
const LABEL_OFFSET: Partial<Record<ModuleId, [number, number, number]>> = {
  pc: [-.6, .02, .5],
  regfile: [.42, .02, .5],
}

export function ModuleBlock({ module, labelHost, value, reveal, timeline, epoch, inspection, reduced, open }: {
  module: typeof MODULES[number]; labelHost: HTMLDivElement; value: string; reveal: SpringState; timeline: Timeline;
  epoch: number; inspection: boolean; reduced: boolean; open: boolean
}) {
  const material = useRef<MeshPhysicalMaterial>(null)
  const faceMaterial = useRef<MeshBasicMaterial>(null)
  const statusMaterial = useRef<MeshBasicMaterial>(null)
  const body = useRef<Group>(null)
  const label = useRef<HTMLDivElement>(null)
  const geometry = useMemo(() => new RoundedBoxGeometry(module.width, 1.32, .6, 2, .065), [module.width])
  const faceTexture = useMemo(() => createModuleFaceTexture(module.id, MODULES.indexOf(module)), [module.id, module])
  useEffect(() => () => {
    geometry.dispose()
    faceTexture.dispose()
  }, [geometry, faceTexture])
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
      material.current.emissiveIntensity = active ? .035 + response * .12 + emission * .06 : 0
    }
    if (faceMaterial.current) faceMaterial.current.color.copy(active ? COLORS[signal.kind] : FACE_BASE)
    if (statusMaterial.current) {
      statusMaterial.current.color.copy(active ? COLORS[signal.kind] : STATUS_IDLE)
      statusMaterial.current.opacity = active ? .62 + response * .35 + emission * .24 : .42
    }
    if (body.current) {
      body.current.position.z = reduced ? 0 : response * .06
      body.current.scale.setScalar(reduced ? 1 : 1 + response * .014)
    }
    if (label.current) {
      label.current.style.opacity = String(smoothstep(.58, .94, reveal.position))
      label.current.style.color = active ? MOTION.color[signal.kind] : '#eef3f9'
      label.current.dataset.responding = active ? 'true' : 'false'
      label.current.classList.toggle('active', active)
    }
  })
  return <>
    <group ref={body}>
      <mesh geometry={geometry} dispose={null}>
        <meshPhysicalMaterial ref={material} color="#162630" metalness={.48} roughness={.4} clearcoat={.55} clearcoatRoughness={.3} envMapIntensity={1.05} />
        <Edges color="#9bb5c3" threshold={38} />
      </mesh>
      <mesh position={[0, 0, .312]} renderOrder={3}>
        <planeGeometry args={[module.width - .22, 1.04]} />
        <meshBasicMaterial ref={faceMaterial} map={faceTexture} color="#c2d7e0" transparent opacity={.92} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -.5, .316]} renderOrder={4}>
        <planeGeometry args={[module.width * .48, .022]} />
        <meshBasicMaterial ref={statusMaterial} color="#355563" transparent opacity={.42} depthWrite={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
    </group>
    <Html portal={{ current: labelHost }} center position={LABEL_OFFSET[module.id] ?? [0, .02, .5]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={label} className="module-label" data-module={module.id as ModuleId} aria-hidden={!open} style={{ opacity: 0 }}><b className="module-full">{module.title}</b><b className="module-short" aria-label={module.title}>{SHORT[module.id]}</b><span>{module.sub}</span><code>{value}</code></div>
    </Html>
  </>
}
