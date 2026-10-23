import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { AdditiveBlending, BufferGeometry, Line as ThreeLine, LineBasicMaterial, Mesh, Vector3 } from 'three'
import { MOTION, smoothstep } from '../motion/design'
import { presentationClock, type ScheduledTransfer, type Timeline } from '../motion/timeline'
import type { WireDef } from './topology'

export function sampledPath(wire: WireDef, count = 160): Vector3[] {
  const path = wire.points.map(p => new Vector3(p[0], p[1], .12))
  const lengths = path.slice(1).map((p, i) => p.distanceTo(path[i]))
  const total = lengths.reduce((sum, n) => sum + n, 0)
  return Array.from({ length: count }, (_, index) => {
    let distance = total * index / (count - 1)
    for (let i = 0; i < lengths.length; i++) {
      if (distance <= lengths[i]) return new Vector3().lerpVectors(path[i], path[i + 1], distance / lengths[i])
      distance -= lengths[i]
    }
    return path[path.length - 1].clone()
  })
}

export function SignalFlow({ wire, transfer, timeline, epoch, inspection, reduced }: {
  wire: WireDef; transfer?: ScheduledTransfer; timeline: Timeline; epoch: number; inspection: boolean; reduced: boolean
}) {
  const head = useRef<Mesh>(null)
  const halo = useRef<Mesh>(null)
  const samples = useMemo(() => sampledPath(wire), [wire])
  const cursorPosition = useMemo(() => new Vector3(), [])
  const color = MOTION.color[transfer?.kind ?? 'data']
  const beams = useMemo(() => Array.from({ length: 4 }, () => {
    const geometry = new BufferGeometry().setFromPoints(samples)
    geometry.setDrawRange(0, 0)
    return new ThreeLine(geometry, new LineBasicMaterial({
      color, transparent: true, opacity: .9, depthTest: true, depthWrite: false, blending: AdditiveBlending,
    }))
  }), [samples, color])
  useEffect(() => () => { for (const beam of beams) { beam.geometry.dispose(); beam.material.dispose() } }, [beams])
  useFrame(() => {
    if (!head.current || !halo.current) return
    const time = presentationClock.read(epoch, inspection, timeline.duration)
    const on = !!transfer && time >= transfer.start
    head.current.visible = on
    halo.current.visible = on && !reduced
    beams.forEach(beam => { beam.visible = on && !reduced })
    if (!transfer || !on) return
    const progress = Math.max(0, Math.min(1, (time - transfer.start) / (transfer.end - transfer.start)))
    const cursor = smoothstep(0, 1, progress) * (samples.length - 1)
    const index = Math.floor(cursor)
    const fade = inspection || reduced ? .8 : Math.exp(-Math.max(0, time - transfer.end) * 12)
    beams.forEach((beam, part) => {
      const start = Math.max(0, index - (4 - part) * 6)
      const end = Math.max(start, index - (3 - part) * 6)
      beam.geometry.setDrawRange(start, Math.max(0, end - start + 1))
      beam.material.opacity = fade * ((part + 1) / 4) ** 2
    })
    cursorPosition.lerpVectors(samples[index], samples[Math.min(index + 1, samples.length - 1)], cursor - index)
    head.current.position.copy(cursorPosition)
    halo.current.position.copy(cursorPosition)
    head.current.scale.setScalar(reduced ? .82 : 1 + .3 * Math.exp(-Math.max(0, time - transfer.start) * 16))
    halo.current.scale.setScalar((1.8 + .55 * Math.exp(-Math.max(0, time - transfer.start) * 9)) * (reduced ? .65 : 1))
    const material = head.current.material as import('three').MeshBasicMaterial
    material.opacity = fade
    const haloMaterial = halo.current.material as import('three').MeshBasicMaterial
    haloMaterial.opacity = fade * .22
  })
  return <>
    <Line points={wire.points.map(p => [p[0], p[1], .1] as [number, number, number])} color="#8ba3b3" lineWidth={1.45} transparent opacity={.82} dashed={wire.control} dashSize={.12} gapSize={.08} />
    {beams.map((beam, index) => <primitive key={index} object={beam} />)}
    <mesh ref={halo} visible={false} renderOrder={3}><sphereGeometry args={[.16, 12, 8]} /><meshBasicMaterial color={color} transparent opacity={.22} depthTest depthWrite={false} blending={AdditiveBlending} /></mesh>
    <mesh ref={head} visible={false} renderOrder={4}><sphereGeometry args={[.09, 12, 8]} /><meshBasicMaterial color={color} transparent depthTest depthWrite={false} blending={AdditiveBlending} /></mesh>
  </>
}
