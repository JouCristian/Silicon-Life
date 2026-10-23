import { useMemo, useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html, Line } from '@react-three/drei'
import { Group, type Mesh } from 'three'
import { smoothstep, type SpringState, MOTION } from '../../motion/design'
import { useLabView } from '../../stores/useLabStore'
import { POSITIONS } from '../topology'
import { EXPLORERS, type ExplorerId } from './model'
import { INTERIOR_WIDTH, INTERIOR_HEIGHT } from './camera'

export function ModuleInterior({ id, progress, labelHost, anchor }: {
  id: ExplorerId; progress: SpringState; labelHost: HTMLDivElement; anchor: RefObject<Group | null>
}) {
  const { cpu, trace } = useLabView()
  const model = useMemo(() => EXPLORERS[id].build(cpu, trace), [id, cpu, trace])
  const root = useRef<Group>(null), labels = useRef<(HTMLDivElement | null)[]>([])
  const position = POSITIONS[id]
  useFrame(() => {
    const p = Math.max(0, Math.min(1, progress.position)), opacity = smoothstep(.05, .75, p)
    if (root.current) {
      root.current.visible = p > .001
      root.current.scale.setScalar(.18 + .82 * p)
      root.current.traverse(object => {
        const material = (object as Mesh).material
        if (material) for (const mat of Array.isArray(material) ? material : [material]) mat.opacity = opacity * (mat.userData.fade ?? 1)
      })
    }
    labels.current.forEach(label => { if (label) { label.style.opacity = String(smoothstep(.5, .9, p)); label.style.visibility = p > .35 ? 'visible' : 'hidden' } })
  }, -.4)
  return <group position={[position[0], position[1], .85]}>
    <group ref={anchor} />
    <group ref={root} onClick={event => { if (progress.position > .1) event.stopPropagation() }} onPointerOver={event => { if (progress.position > .1) event.stopPropagation() }}>
      <mesh position={[0, 0, -.12]} renderOrder={30}>
        <boxGeometry args={[INTERIOR_WIDTH, INTERIOR_HEIGHT, .16]} />
        <meshBasicMaterial color="#101c25" transparent depthTest={false} depthWrite={false} />
        <Edges color="#658a9f" transparent depthTest={false} renderOrder={31} />
      </mesh>
      {model.wires.map((wire, i) => {
        const from = model.nodes.find(node => node.id === wire.from)!, to = model.nodes.find(node => node.id === wire.to)!
        const color = MOTION.color[wire.kind ?? 'data']
        return <Line key={`${wire.from}-${wire.to}-${i}`} points={[[...from.position, .015], [...to.position, .015]]} color={color} transparent depthTest={false} renderOrder={32} opacity={.8} lineWidth={wire.active ? 1.8 : 1} />
      })}
      {model.nodes.map((node, i) => <group key={node.id} position={[...node.position, .08]}>
        <mesh renderOrder={33}>
          <boxGeometry args={[node.width ?? 1.7, .57, .14]} />
          <meshBasicMaterial color={node.active ? '#243d4d' : '#15232d'} transparent depthTest={false} depthWrite={false} />
          <Edges color={node.active ? MOTION.color[node.kind ?? 'data'] : '#415762'} transparent depthTest={false} renderOrder={34} />
        </mesh>
        <Html portal={{ current: labelHost }} center position={[0, 0, .1]} zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
          <div ref={el => { labels.current[i] = el }} className={`explore-node-label ${/^x\d+$/.test(node.id) ? 'is-register' : ''}`} data-explore-node={node.id} style={{ color: node.active ? MOTION.color[node.kind ?? 'data'] : '#dce5ed' }}>
            <b>{node.title}</b><code title={node.value}>{/^x\d+$/.test(node.id) ? node.value.replace(/^0x/, '') : node.value}</code>
          </div>
        </Html>
      </group>)}
    </group>
  </group>
}
