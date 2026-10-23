import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, RoundedBox } from '@react-three/drei'
import { AdditiveBlending, Group, Material, Mesh, MeshBasicMaterial, PointLight } from 'three'
import { smoothstep, type SpringState } from '../../motion/design'
import { useLabView } from '../../stores/useLabStore'
import { POSITIONS } from '../topology'
import { EXPLORERS, type ExplorerId } from './model'
import { INTERIOR_HEIGHT, INTERIOR_WIDTH } from './camera'
import { ModuleHardware } from './hardware'

const METAL = '#8c9aa6'
const PCB = '#081116'

/** A clean carrier board for one module. There are deliberately no package
 *  pins, lid or decorative bond wires here: focus mode should read as a single
 *  instrument board above the (defocused) CPU plane. */
export function ModuleInterior({ id, progress, labelHost, anchor }: {
  id: ExplorerId; progress: SpringState; labelHost: HTMLDivElement; anchor: RefObject<Group | null>
}) {
  const { cpu, trace, program } = useLabView()
  const [shownId, setShownId] = useState<ExplorerId>(id)
  const model = useMemo(() => EXPLORERS[shownId].build(cpu, trace), [shownId, cpu, trace])
  const stage = useRef<Group>(null), root = useRef<Group>(null), hardware = useRef<Group>(null)
  const switchVeil = useRef<Mesh>(null), switchMaterial = useRef<MeshBasicMaterial>(null)
  const keyLight = useRef<PointLight>(null), rimLight = useRef<PointLight>(null)
  const switchState = useRef({ active: false, elapsed: 0, next: id, swapped: true })
  const fadeMaterials = useRef<{ material: Material & { opacity: number; transparent: boolean; depthWrite: boolean }; baseOpacity: number; baseDepthWrite: boolean }[]>([])
  const spread = ['mux', 'wb', 'imm', 'decoder', 'branch', 'nextpc'].includes(shownId) ? 1.1 : 1

  useEffect(() => {
    if (id === shownId) return
    switchState.current = { active: true, elapsed: 0, next: id, swapped: false }
  }, [id, shownId])

  useLayoutEffect(() => {
    if (!root.current) return
    const seen = new Set<Material>(), list: typeof fadeMaterials.current = []
    root.current.traverse(object => {
      const raw = (object as Mesh).material
      if (!raw) return
      for (const value of Array.isArray(raw) ? raw : [raw]) {
        if (!value || seen.has(value) || value.userData?.noFade) continue
        const material = value as Material & { opacity: number; transparent: boolean; depthWrite: boolean }
        seen.add(material)
        list.push({ material, baseOpacity: material.opacity ?? 1, baseDepthWrite: material.depthWrite ?? true })
        material.transparent = true
        material.needsUpdate = true
      }
    })
    fadeMaterials.current = list
  }, [])

  useFrame((_, dt) => {
    const p = Math.max(0, Math.min(1, progress.position))
    const rise = smoothstep(.06, .86, p)
    const fade = smoothstep(.04, .4, p)
    const travel = smoothstep(.04, .72, p)
    const origin = POSITIONS[id]
    if (stage.current) {
      // The focused carrier lives over the module while hidden, expands into the
      // central focus frame, and on Esc retracts to that same module point.
      stage.current.position.set(origin[0] * (1 - travel), origin[1] * (1 - travel) + .08 * travel, .55 + .51 * travel)
      stage.current.scale.setScalar(.065 + .935 * travel)
    }
    const swap = switchState.current
    if (swap.active) {
      swap.elapsed += Math.min(.05, dt)
      const t = Math.min(1, swap.elapsed / .55)
      if (!swap.swapped && t >= .42) {
        swap.swapped = true
        setShownId(swap.next)
      }
      if (switchVeil.current && switchMaterial.current) {
        switchVeil.current.visible = true
        switchMaterial.current.opacity = Math.sin(t * Math.PI) * .6
      }
      if (t >= 1) {
        swap.active = false
        if (switchVeil.current) switchVeil.current.visible = false
      }
    } else if (switchVeil.current) {
      switchVeil.current.visible = false
    }
    if (root.current) {
      root.current.visible = p > .001
      root.current.scale.setScalar(.7 + .3 * rise)
      root.current.position.z = .02 + .12 * rise
    }
    if (hardware.current) {
      hardware.current.position.z = .14 + .2 * rise
      hardware.current.scale.setScalar((.95 + .05 * rise) * spread)
    }
    const lamp = smoothstep(.18, .92, p)
    if (keyLight.current) keyLight.current.intensity = lamp * 42
    if (rimLight.current) rimLight.current.intensity = lamp * 18
    for (const entry of fadeMaterials.current) {
      entry.material.opacity = entry.baseOpacity * fade
      entry.material.depthWrite = fade > .995 ? entry.baseDepthWrite : false
    }
  }, -.35)

  return <group ref={stage}>
    <group ref={anchor} />
    <group ref={root}
      onClick={event => { if (progress.position > .1) event.stopPropagation() }}
      onPointerOver={event => { if (progress.position > .5) event.stopPropagation() }}>
      <RoundedBox args={[INTERIOR_WIDTH + .22, INTERIOR_HEIGHT + .22, .15]} radius={.12} smoothness={4} position={[0, 0, -.12]}>
        <meshStandardMaterial color={METAL} metalness={.93} roughness={.26} />
        <Edges color="#c1ccd3" threshold={22} />
      </RoundedBox>
      <RoundedBox args={[INTERIOR_WIDTH, INTERIOR_HEIGHT, .2]} radius={.08} smoothness={3} position={[0, 0, -.01]}>
        <meshStandardMaterial color={PCB} metalness={.56} roughness={.4} />
        <Edges color="#455e6b" threshold={18} />
      </RoundedBox>
      {[-3.55, 3.55].map(x => [-2.15, 2.15].map(y => <group key={`${x}-${y}`} position={[x, y, .1]}>
        <mesh><cylinderGeometry args={[.1, .1, .07, 14]} /><meshStandardMaterial color="#a8b5bd" metalness={.95} roughness={.2} /></mesh>
        <mesh position={[0, 0, .04]}><cylinderGeometry args={[.035, .035, .015, 10]} /><meshStandardMaterial color="#3e535e" metalness={.8} roughness={.34} /></mesh>
      </group>))}
      <RoundedBox args={[6.35, 3.85, .18]} radius={.05} smoothness={3} position={[0, 0, .1]}>
        <meshStandardMaterial color="#0d222c" metalness={.44} roughness={.44} />
        <Edges color="#315563" threshold={18} />
      </RoundedBox>
      {[-2.95, 2.95].map(x => <mesh key={`rail-${x}`} position={[x, 0, .22]}><boxGeometry args={[.03, 3.35, .025]} /><meshBasicMaterial color="#3e7d99" toneMapped={false} /></mesh>)}
      <group ref={hardware}>
        <ModuleHardware id={shownId} model={model} progress={progress} labelHost={labelHost} program={program} />
      </group>
      <mesh ref={switchVeil} position={[0, 0, .92]} visible={false} renderOrder={40} raycast={() => null}>
        <planeGeometry args={[INTERIOR_WIDTH, INTERIOR_HEIGHT]} />
        <meshBasicMaterial ref={switchMaterial} color="#8bd4ff" transparent opacity={0} depthTest={false} depthWrite={false} blending={AdditiveBlending} toneMapped={false} userData={{ noFade: true }} />
      </mesh>
      <mesh position={[0, -INTERIOR_HEIGHT / 2 + .18, .22]}><boxGeometry args={[3.5, .025, .02]} /><meshBasicMaterial color="#3d7992" toneMapped={false} /></mesh>
      <mesh position={[0, 0, -.34]} raycast={() => null}><planeGeometry args={[INTERIOR_WIDTH + .8, INTERIOR_HEIGHT + .8]} /><meshBasicMaterial color="#1b4b63" transparent opacity={.08} blending={AdditiveBlending} depthWrite={false} /></mesh>
    </group>
    <pointLight ref={keyLight} position={[2.8, 3.4, 4.4]} intensity={0} distance={15} decay={2} color="#eef8ff" />
    <pointLight ref={rimLight} position={[-3.4, -2.2, 3.2]} intensity={0} distance={13} decay={2} color="#83bce4" />
  </group>
}
