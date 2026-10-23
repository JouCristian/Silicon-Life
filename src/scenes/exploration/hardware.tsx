import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html, RoundedBox } from '@react-three/drei'
import type { Mesh, MeshBasicMaterial } from 'three'
import { assembly, decode, hex, instructionFormat } from '../../core/isa'
import type { ProgramWords } from '../../core/rom'
import type { ModuleId } from '../../core/trace/types'
import { MOTION, smoothstep } from '../../motion/design'
import type { ExploreNode, ModuleExploration } from './model'

const METAL = '#8d9ca8'
const GOLD = '#b79255'
const DATA = MOTION.color.data
const CONTROL = MOTION.color.control
const WRITE = MOTION.color.writeback

interface HardwareProps {
  id: ModuleId
  model: ModuleExploration
  progress: { position: number }
  labelHost: HTMLDivElement
  program?: ProgramWords
}

const node = (model: ModuleExploration, id: string): ExploreNode | undefined => model.nodes.find(item => item.id === id)
const parseHex = (text?: string) => text && /^0x[\da-f]+$/i.test(text) ? Number.parseInt(text.slice(2), 16) >>> 0 : undefined

type InstrFormat = 'R' | 'I' | 'S' | 'B' | 'U' | 'J'
interface FieldDef { key: string; label: string; range: string; msb: number; lsb: number; color: string; value: string }
const fieldBits = (word: number, msb: number, lsb: number) => {
  const width = msb - lsb + 1
  return (word >>> lsb & ((1 << width) - 1)).toString(2).padStart(width, '0')
}
function instructionFields(format: InstrFormat, word: number): FieldDef[] {
  const opcode = { key: 'opcode', label: 'opcode', range: '6:0', msb: 6, lsb: 0, color: CONTROL }
  const rd = { key: 'rd', label: 'rd', range: '11:7', msb: 11, lsb: 7, color: DATA }
  const funct3 = { key: 'funct3', label: 'funct3', range: '14:12', msb: 14, lsb: 12, color: CONTROL }
  const rs1 = { key: 'rs1', label: 'rs1', range: '19:15', msb: 19, lsb: 15, color: DATA }
  const rs2 = { key: 'rs2', label: 'rs2', range: '24:20', msb: 24, lsb: 20, color: DATA }
  const funct7 = { key: 'funct7', label: 'funct7', range: '31:25', msb: 31, lsb: 25, color: CONTROL }
  const defs = format === 'R' ? [funct7, rs2, rs1, funct3, rd, opcode]
    : format === 'I' ? [{ key: 'imm', label: 'imm', range: '31:20', msb: 31, lsb: 20, color: GOLD }, rs1, funct3, rd, opcode]
      : format === 'S' ? [{ key: 'imm-hi', label: 'imm[11:5]', range: '31:25', msb: 31, lsb: 25, color: GOLD }, rs2, rs1, funct3, { key: 'imm-lo', label: 'imm[4:0]', range: '11:7', msb: 11, lsb: 7, color: GOLD }, opcode]
        : format === 'B' ? [{ key: 'imm-hi', label: 'imm[12|10:5]', range: '31:25', msb: 31, lsb: 25, color: GOLD }, rs2, rs1, funct3, { key: 'imm-lo', label: 'imm[4:1|11]', range: '11:7', msb: 11, lsb: 7, color: GOLD }, opcode]
          : format === 'U' ? [{ key: 'imm', label: 'imm[31:12]', range: '31:12', msb: 31, lsb: 12, color: GOLD }, rd, opcode]
            : [{ key: 'imm', label: 'imm[20|10:1|11|19:12]', range: '31:12', msb: 31, lsb: 12, color: GOLD }, rd, opcode]
  return defs.map(field => ({ ...field, value: fieldBits(word, field.msb, field.lsb) }))
}
const bitColor = (fields: FieldDef[], bit: number) => fields.find(field => bit <= field.msb && bit >= field.lsb)?.color ?? '#3a5664'

type ImmFormat = 'I' | 'S' | 'B' | 'U' | 'J'
interface ImmSource { label: string; msb: number; lsb: number; bits: number; color: string }
interface ImmLayout { sext: number; sources: ImmSource[]; zero: number; expr: string }
const IMM_LAYOUTS: Record<ImmFormat, ImmLayout> = {
  I: { sext: 20, zero: 0, expr: '31:20', sources: [{ label: '31:20', msb: 31, lsb: 20, bits: 12, color: DATA }] },
  S: { sext: 20, zero: 0, expr: '31:25 + 11:7', sources: [
    { label: '31:25', msb: 31, lsb: 25, bits: 7, color: DATA },
    { label: '11:7', msb: 11, lsb: 7, bits: 5, color: WRITE },
  ] },
  B: { sext: 19, zero: 1, expr: '31|7|30:25|11:8|0', sources: [
    { label: '31', msb: 31, lsb: 31, bits: 1, color: CONTROL },
    { label: '7', msb: 7, lsb: 7, bits: 1, color: DATA },
    { label: '30:25', msb: 30, lsb: 25, bits: 6, color: GOLD },
    { label: '11:8', msb: 11, lsb: 8, bits: 4, color: WRITE },
  ] },
  U: { sext: 0, zero: 12, expr: '31:12 + 12×0', sources: [{ label: '31:12', msb: 31, lsb: 12, bits: 20, color: DATA }] },
  J: { sext: 11, zero: 1, expr: '31|19:12|20|30:21|0', sources: [
    { label: '31', msb: 31, lsb: 31, bits: 1, color: CONTROL },
    { label: '19:12', msb: 19, lsb: 12, bits: 8, color: DATA },
    { label: '20', msb: 20, lsb: 20, bits: 1, color: GOLD },
    { label: '30:21', msb: 30, lsb: 21, bits: 10, color: WRITE },
  ] },
}
interface ImmGroup {
  key: string
  kind: 'sext' | 'source' | 'zero'
  label: string
  input?: { msb: number; lsb: number }
  output: { msb: number; lsb: number }
  color: string
}
function immediateGroups(format: ImmFormat, signColor: string, zeroColor: string): ImmGroup[] {
  const layout = IMM_LAYOUTS[format]
  const groups: ImmGroup[] = []
  if (layout.sext > 0) groups.push({ key: 'sext', kind: 'sext', label: `SEXT ×${layout.sext} · imm[${31}:${32 - layout.sext}]`, input: { msb: 31, lsb: 31 }, output: { msb: 31, lsb: 32 - layout.sext }, color: signColor })
  let cursor = 31 - layout.sext
  layout.sources.forEach((source, i) => {
    const outMsb = cursor
    cursor -= source.bits
    groups.push({ key: `src-${i}`, kind: 'source', label: `instr[${source.msb}:${source.lsb}] → imm[${outMsb}:${outMsb - source.bits + 1}]`, input: { msb: source.msb, lsb: source.lsb }, output: { msb: outMsb, lsb: outMsb - source.bits + 1 }, color: source.color })
  })
  if (layout.zero > 0) groups.push({ key: 'zero', kind: 'zero', label: `0 ×${layout.zero} · imm[${layout.zero - 1}:0]`, output: { msb: layout.zero - 1, lsb: 0 }, color: zeroColor })
  return groups
}

function Probe({ position, title, value, color, progress, labelHost, compact = false }: {
  position: [number, number, number]; title: string; value: string; color: string; progress: { position: number }; labelHost: HTMLDivElement; compact?: boolean
}) {
  const element = useRef<HTMLDivElement>(null)
  const reveal = useRef(0), pulse = useRef(1), last = useRef(value)
  useFrame((_, dt) => {
    if (last.current !== value) {
      last.current = value
      pulse.current = 0
    }
    reveal.current = Math.min(1, reveal.current + dt / .38)
    pulse.current = Math.min(1, pulse.current + dt / .3)
    if (element.current) {
      const stage = smoothstep(.48, .88, progress.position)
      element.current.style.opacity = String(stage * smoothstep(0, .72, reveal.current) * smoothstep(0, .72, pulse.current))
    }
  })
  return <Html portal={{ current: labelHost }} center position={position} zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
    <div ref={element} className={`explore-node-label${compact ? ' is-compact' : ''}`} style={{ color, opacity: 0 }}><b>{title}</b><code>{value}</code></div>
  </Html>
}

function Strip({ width = 7.6, depth = .16, y = 0, color = '#2a3e49' }: { width?: number; depth?: number; y?: number; color?: string }) {
  return <mesh position={[0, y, .035]}><boxGeometry args={[width, depth, .035]} /><meshStandardMaterial color={color} metalness={.78} roughness={.32} /></mesh>
}

function Cell({ position, active, color = DATA, size = [.34, .5, .16] }: {
  position: [number, number, number]; active?: boolean; color?: string; size?: [number, number, number]
}) {
  return <group position={position}>
    <RoundedBox args={size} radius={.045} smoothness={2}>
      <meshStandardMaterial color={active ? '#284a5b' : '#1a2932'} metalness={.66} roughness={.33} emissive={active ? color : '#020406'} emissiveIntensity={active ? .22 : .02} />
      <Edges color={active ? color : '#4b616d'} threshold={24} />
    </RoundedBox>
    <mesh position={[0, 0, size[2] / 2 + .006]}><planeGeometry args={[size[0] * .55, .025]} /><meshBasicMaterial color={active ? color : '#3b5664'} toneMapped={false} /></mesh>
  </group>
}

function Block({ position, size, color = METAL, emissive, children }: {
  position: [number, number, number]; size: [number, number, number]; color?: string; emissive?: string; children?: ReactNode
}) {
  return <group position={position}>
    <RoundedBox args={size} radius={.055} smoothness={3}>
      <meshStandardMaterial color={color} metalness={.76} roughness={.3} emissive={emissive ?? '#010203'} emissiveIntensity={emissive ? .15 : 0} />
      <Edges color={emissive ?? '#697b86'} threshold={24} />
    </RoundedBox>
    {children}
  </group>
}

function Bus({ x1, x2, y, z = .13, color = '#4e6e7d', height = .055 }: { x1: number; x2: number; y: number; z?: number; color?: string; height?: number }) {
  return <mesh position={[(x1 + x2) / 2, y, z]}><boxGeometry args={[Math.abs(x2 - x1), height, .05]} /><meshStandardMaterial color={color} metalness={.65} roughness={.4} emissive={color} emissiveIntensity={.12} /></mesh>
}

function Mux({ position, inputs = 2, color = CONTROL }: { position: [number, number, number]; inputs?: number; color?: string }) {
  return <group position={position}>
    <Block position={[0, 0, .24]} size={[.72, .54, .42]} color="#21343f" emissive={color} />
    {Array.from({ length: inputs }, (_, i) => <mesh key={i} position={[-.32, (i - (inputs - 1) / 2) * .15, .45]}><cylinderGeometry args={[.025, .025, .05, 8]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>)}
  </group>
}

function PcHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const q = node(model, 'q'), d = node(model, 'd'), pc4 = node(model, 'pc4'), target = node(model, 'target')
  const select = node(model, 'select'), edge = node(model, 'edge')
  const pc = q?.value ?? '0x00000000'
  const pcWord = Number.parseInt(pc.replace(/^0x/i, ''), 16) || 0
  const last = useRef(''), pulse = useRef(0), flow = useRef(1)
  const token = useRef<Mesh>(null), tokenMaterial = useRef<MeshBasicMaterial>(null)
  const clockRing = useRef<Mesh>(null), clockRingMaterial = useRef<MeshBasicMaterial>(null)
  const registerGlow = useRef<MeshBasicMaterial>(null)

  useFrame((_, dt) => {
    const signature = `${d?.value ?? ''}|${q?.value ?? ''}|${edge?.value ?? ''}`
    if (last.current && signature !== last.current) {
      pulse.current = 1
      flow.current = 0
    }
    last.current = signature
    pulse.current = Math.max(0, pulse.current - dt * 1.45)
    flow.current = Math.min(1, flow.current + dt / .52)
    const travel = smoothstep(0, 1, flow.current)
    if (token.current) {
      token.current.visible = flow.current > .002 && flow.current < .998
      token.current.position.set(-3.02 + 4.05 * travel, .66, .66)
      token.current.scale.setScalar(.9 + .35 * Math.sin(travel * Math.PI))
    }
    if (tokenMaterial.current) tokenMaterial.current.opacity = Math.sin(flow.current * Math.PI) * .9
    if (clockRing.current) clockRing.current.scale.setScalar(1 + .9 * pulse.current)
    if (clockRingMaterial.current) clockRingMaterial.current.opacity = pulse.current * .85
    if (registerGlow.current) registerGlow.current.opacity = pulse.current * .1
  })

  return <group>
    <Strip width={7.6} depth={.08} y={-2.35} color="#273c47" />

    {/* The two physical zones make the RTL boundary literal. */}
    <mesh position={[-1.2, .3, .06]}><boxGeometry args={[4.75, 4.25, .06]} /><meshStandardMaterial color="#0b1a21" metalness={.45} roughness={.5} /><Edges color="#29434f" threshold={20} /></mesh>
    <mesh position={[2.78, .3, .06]}><boxGeometry args={[2.05, 4.25, .06]} /><meshStandardMaterial color="#0a161c" metalness={.4} roughness={.55} /><Edges color="#253a44" threshold={20} /></mesh>
    <mesh position={[1.53, 0, .12]}><boxGeometry args={[.018, 4.15, .025]} /><meshBasicMaterial color="#9a7b43" toneMapped={false} /></mesh>

    {/* pc.v: D port -> 32-bit register -> Q port. */}
    <group position={[-3.32, .65, .2]}>
      <Block position={[0, 0, .18]} size={[.42, 1.15, .34]} color="#1e3742" />
      <mesh position={[.24, 0, .2]}><cylinderGeometry args={[.08, .08, .42, 16]} /><meshStandardMaterial color={GOLD} metalness={.92} roughness={.22} /></mesh>
    </group>
    <Bus x1={-3.08} x2={-2.66} y={.65} z={.42} color={DATA} />
    <Block position={[-1.24, .35, .18]} size={[2.86, 2.3, .28]} color="#10242d" />
    {Array.from({ length: 32 }, (_, i) => <Cell key={i} position={[-2.44 + (i % 8) * .33, .93 - Math.floor(i / 8) * .45, .4]} active={((pcWord >>> i) & 1) === 1} color={i % 8 === 0 ? WRITE : DATA} size={[.245, .3, .13]} />)}
    <mesh position={[-1.24, .35, .51]}><planeGeometry args={[2.62, 2.02]} /><meshBasicMaterial ref={registerGlow} color={DATA} transparent opacity={0} depthWrite={false} /></mesh>
    <mesh position={[-1.24, 1.36, .48]}><boxGeometry args={[2.62, .035, .02]} /><meshBasicMaterial color={DATA} toneMapped={false} /></mesh>
    <Bus x1={.19} x2={.78} y={.65} z={.42} color={WRITE} />
    <group position={[.96, .65, .2]}>
      <Block position={[0, 0, .18]} size={[.38, 1.05, .32]} color="#1e3742" />
      <mesh position={[-.2, 0, .2]}><cylinderGeometry args={[.075, .075, .4, 16]} /><meshStandardMaterial color={GOLD} metalness={.92} roughness={.22} /></mesh>
    </group>

    {/* Clock and synchronous reset are the only control inputs of pc.v. */}
    <group position={[-2.75, -1.68, .2]}>
      <Block position={[0, 0, .16]} size={[.38, .36, .26]} color="#223a45" emissive={CONTROL} />
      <mesh ref={clockRing} position={[0, 0, .46]}><torusGeometry args={[.2, .018, 8, 24]} /><meshBasicMaterial ref={clockRingMaterial} color={CONTROL} transparent opacity={0} depthWrite={false} /></mesh>
    </group>
    <group position={[-2.13, -1.68, .2]}>
      <Block position={[0, 0, .16]} size={[.38, .36, .26]} color="#3a3030" emissive="#c58d66" />
    </group>
    {[-2.75, -2.13].map(x => <mesh key={x} position={[x, -.92, .42]}><boxGeometry args={[.025, 1.35, .02]} /><meshBasicMaterial color={x === -2.75 ? CONTROL : '#c58d66'} toneMapped={false} /></mesh>)}
    <mesh position={[-1.24, -1.02, .44]}><boxGeometry args={[3.0, .03, .02]} /><meshBasicMaterial color="#375666" toneMapped={false} /></mesh>

    {/* cpu_top.v: external PC+4, target, redirect and trap/fault hold. */}
    <group position={[2.8, 0, .2]}>
      <Block position={[0, 1.25, .2]} size={[1.5, .44, .3]} color="#1b303a" emissive={DATA} />
      <Block position={[0, .45, .2]} size={[1.5, .44, .3]} color="#1b303a" emissive={DATA} />
      <Mux position={[0, -.5, .2]} inputs={2} color={CONTROL} />
      <Block position={[0, -1.38, .2]} size={[1.5, .38, .3]} color="#263039" emissive="#c58d66" />
      <Bus x1={-1.1} x2={-1.0} y={1.25} z={.42} color={DATA} />
      <Bus x1={-1.1} x2={-1.0} y={.45} z={.42} color={DATA} />
      <Bus x1={-.35} x2={.9} y={-.8} z={.42} color={DATA} />
      <mesh position={[0, -.99, .4]}><boxGeometry args={[.025, .42, .02]} /><meshBasicMaterial color={DATA} toneMapped={false} /></mesh>
    </group>
    <Bus x1={1.15} x2={1.72} y={.65} z={.4} color={WRITE} />
    <mesh position={[1.72, -.34, .4]}><boxGeometry args={[.025, 2.05, .02]} /><meshBasicMaterial color={WRITE} toneMapped={false} /></mesh>
    <Bus x1={1.72} x2={2.05} y={1.25} z={.4} color={DATA} />
    <Bus x1={1.72} x2={2.05} y={.45} z={.4} color={DATA} />

    {/* normal_next_pc / next_pc returns to D from the external block. */}
    <mesh position={[2.8, -1.82, .4]}><boxGeometry args={[.025, .55, .02]} /><meshBasicMaterial color={DATA} toneMapped={false} /></mesh>
    <Bus x1={-3.32} x2={2.8} y={-2.08} z={.4} color={DATA} />
    <mesh position={[-3.32, -.75, .4]}><boxGeometry args={[.025, 2.65, .02]} /><meshBasicMaterial color={DATA} toneMapped={false} /></mesh>

    <mesh ref={token} visible={false}><sphereGeometry args={[.07, 12, 8]} /><meshBasicMaterial ref={tokenMaterial} color={DATA} transparent depthWrite={false} /></mesh>

    <Probe position={[-2.05, 1.92, .8]} title="内部 · pc.v" value="32-bit DFF · sync reset" color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[-3.18, 1.35, .8]} title="D · next_pc" value={d?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[.82, 1.4, .8]} title="Q · pc → Q′" value={`${q?.value ?? '—'} →\n${edge?.value ?? '—'}`} color={WRITE} progress={progress} labelHost={labelHost} />
    <Probe position={[-2.44, -1.25, .8]} title="clk↑ · sync reset" value="D→Q / reset→0" color={CONTROL} progress={progress} labelHost={labelHost} />
    <Probe position={[2.78, 1.95, .8]} title="外部 · cpu_top.v" value="" color={CONTROL} progress={progress} labelHost={labelHost} />
    <Probe position={[2.78, 1.55, .8]} title="PC+4" value={pc4?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[2.78, .82, .8]} title="target" value={target?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[2.78, -.12, .8]} title="redirect" value={select?.value ?? '—'} color={CONTROL} progress={progress} labelHost={labelHost} />
    <Probe position={[2.78, -1.02, .8]} title="trap / fault hold" value="" color={CONTROL} progress={progress} labelHost={labelHost} />
    <Probe position={[.15, -1.9, .8]} title="next_pc → D" value={d?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} />
  </group>
}

function ReadRoute({ x, yStart, yBus, blockX, color }: { x: number; yStart: number; yBus: number; blockX: number; color: string }) {
  return <group>
    <mesh position={[x, (yStart + yBus) / 2, .4]}><boxGeometry args={[.03, Math.abs(yStart - yBus), .03]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    <mesh position={[(x + blockX) / 2, yBus, .4]}><boxGeometry args={[Math.abs(blockX - x) + .03, .03, .03]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    <mesh position={[blockX, (yBus + 1.78) / 2, .4]}><boxGeometry args={[.03, Math.abs(1.78 - yBus), .03]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
    <mesh position={[blockX, 1.89, .4]}><boxGeometry args={[.03, .22, .03]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
  </group>
}

function WriteRoute({ x, yStart, blockX, committed, invalid, color }: { x: number; yStart: number; blockX: number; committed: boolean; invalid: boolean; color: string }) {
  const opacity = invalid ? 1 : committed ? .95 : .22
  return <group>
    <mesh position={[x, (yStart - 1.22) / 2, .4]}><boxGeometry args={[.03, Math.abs(yStart + 1.22), .03]} /><meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></mesh>
    <mesh position={[(x + blockX) / 2, -1.22, .4]}><boxGeometry args={[Math.abs(blockX - x) + .03, .03, .03]} /><meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></mesh>
    <mesh position={[blockX, -1.36, .4]}><boxGeometry args={[.03, .3, .03]} /><meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></mesh>
    <mesh position={[(blockX - .3) / 2, -1.62, .4]}><boxGeometry args={[Math.abs(blockX + .3), .03, .03]} /><meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></mesh>
  </group>
}

function RegisterFileHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const registers = model.nodes.filter(item => /^x\d+$/.test(item.id))
  const word = parseHex(node(model, 'word')?.value)
  const rs1 = word !== undefined ? (word >>> 15) & 31 : undefined
  const rs2 = word !== undefined ? (word >>> 20) & 31 : undefined
  const rd = word !== undefined ? (word >>> 7) & 31 : undefined
  const readA = node(model, 'read-a'), readB = node(model, 'read-b'), write = node(model, 'write')
  const we = node(model, 'we')?.value === '1'
  const regWrite = node(model, 'reg-write')?.value === '1'
  const committed = !!write?.active
  const rdData = parseHex(node(model, 'rd-data')?.value)
  const [selected, setSelected] = useState<number | null>(0)

  const cellW = .6, cellH = .46, dx = .7, dy = .58
  const startX = -2.45, startY = .95
  const tileX = (index: number) => startX + (index % 8) * dx
  const tileY = (index: number) => startY - Math.floor(index / 8) * dy
  const selectedNode = selected !== null ? registers[selected] : undefined
  const selectedFlags = (() => {
    if (selected === null) return '点击任一寄存器查看本指令读写'
    const flags: string[] = []
    if (selected === rs1) flags.push('rs1 读 A')
    if (selected === rs2) flags.push('rs2 读 B')
    if (committed && selected === rd) flags.push(`rd 同步写 → ${rdData !== undefined ? hex(rdData) : '—'}`)
    if (selected === 0) flags.push('x0 恒零')
    return flags.length ? flags.join(' · ') : '本指令未访问'
  })()
  const x0Invalid = we && rd === 0
  const writeColor = x0Invalid ? '#b65e54' : WRITE

  return <group>
    <Strip width={7.6} depth={.08} y={-2.4} color="#273c47" />
    <mesh position={[0, .05, .06]}><boxGeometry args={[5.9, 2.55, .07]} /><meshStandardMaterial color="#0b1920" metalness={.45} roughness={.5} /><Edges color="#29434f" threshold={20} /></mesh>

    {/* 32 registers, x0..x31, in an 8x4 bank. */}
    <mesh position={[0, 1.17, .16]}><boxGeometry args={[5.55, .05, .04]} /><meshBasicMaterial color={DATA} transparent opacity={.35} toneMapped={false} /></mesh>
    {registers.map((item, index) => {
      const isReadA = index === rs1, isReadB = index === rs2
      const isWrite = committed && index === rd
      const isSelected = selected === index
      const color = index === 0 ? (x0Invalid ? '#b65e54' : '#8f6a3f') : isWrite ? WRITE : isReadA || isReadB ? DATA : isSelected ? CONTROL : '#34505e'
      const value = parseHex(item.value) ?? 0
      return <group key={item.id} position={[tileX(index), tileY(index), .2]} onClick={event => { event.stopPropagation(); setSelected(index) }}>
        <Block position={[0, 0, .08]} size={[cellW, cellH, .17]} color={isSelected ? '#1f3e4b' : '#142831'} emissive={isReadA || isReadB ? DATA : isWrite ? WRITE : undefined} />
        <mesh position={[0, cellH / 2 - .03, .2]}><boxGeometry args={[cellW - .08, .025, .02]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
        {Array.from({ length: 32 }, (_, bit) => {
          const active = ((value >>> bit) & 1) === 1
          return <mesh key={bit} position={[-.248 + bit * .016, -.1, .32]}><boxGeometry args={[.011, .065, .025]} /><meshBasicMaterial color={active ? (isWrite ? WRITE : isReadA || isReadB ? DATA : '#7fb2cc') : '#29424e'} transparent opacity={active ? .98 : .55} toneMapped={false} /></mesh>
        })}
        <Probe position={[0, .1, .4]} title={index === 0 ? 'x0' : `x${index}`} value="" color={isWrite ? writeColor : isReadA || isReadB ? DATA : '#c4d8e3'} progress={progress} labelHost={labelHost} compact />
      </group>
    })}

    {/* Combinational read buses and two 5→32 selectors. */}
    {[1.38, 1.53].map((y, i) => <mesh key={`rb-${i}`} position={[0, y, .42]}><boxGeometry args={[5.5, .026, .02]} /><meshBasicMaterial color={i === 0 ? DATA : CONTROL} transparent opacity={.24} toneMapped={false} /></mesh>)}
    {rs1 !== undefined && <ReadRoute x={tileX(rs1)} yStart={tileY(rs1) + cellH / 2} yBus={1.38} blockX={-2.55} color={DATA} />}
    {rs2 !== undefined && <ReadRoute x={tileX(rs2)} yStart={tileY(rs2) + cellH / 2} yBus={1.53} blockX={2.55} color={CONTROL} />}

    {/* Read ports. */}
    <group position={[-2.55, 2.18, .2]}>
      <Block position={[0, 0, .1]} size={[1.25, .3, .2]} color="#1b303a" emissive={DATA} />
      <Probe position={[0, .02, .45]} title="读 A · rs1" value={`${readA?.value ?? '—'} · 5→32 异步`} color={DATA} progress={progress} labelHost={labelHost} />
    </group>
    <group position={[2.55, 2.18, .2]}>
      <Block position={[0, 0, .1]} size={[1.25, .3, .2]} color="#1b303a" emissive={CONTROL} />
      <Probe position={[0, .02, .45]} title="读 B · rs2" value={`${readB?.value ?? '—'} · 5→32 异步`} color={CONTROL} progress={progress} labelHost={labelHost} />
    </group>
    <Bus x1={-1.75} x2={-2.55} y={2.0} color={DATA} />
    <Bus x1={1.75} x2={2.55} y={2.0} color={CONTROL} />


    {/* Write bus, write decode and the single clocked port. */}
    <mesh position={[0, -1.22, .42]}><boxGeometry args={[5.5, .025, .03]} /><meshBasicMaterial color={WRITE} transparent opacity={.28} toneMapped={false} /></mesh>
    {rd !== undefined && <WriteRoute x={tileX(rd)} yStart={tileY(rd) - cellH / 2} blockX={.55} committed={committed && !x0Invalid} invalid={x0Invalid && rd === 0} color={writeColor} />}
    <group position={[.55, -1.85, .2]}>
      <Block position={[0, 0, .12]} size={[1.7, .36, .22]} color="#1b303a" emissive={committed ? WRITE : undefined} />
      <Probe position={[0, .02, .5]} title="写口 · 5→32 · clk↑" value={`x${rd ?? '—'} ← ${rdData !== undefined ? hex(rdData) : '—'} · we=${we ? 1 : 0}${x0Invalid ? ' · x0 丢弃' : ''}`} color={committed ? WRITE : '#738b98'} progress={progress} labelHost={labelHost} />
    </group>
    <mesh position={[.55, -1.4, .42]}><boxGeometry args={[.018, .44, .03]} /><meshBasicMaterial color={committed ? WRITE : '#405865'} toneMapped={false} /></mesh>
    <mesh position={[1.0, -1.35, .42]}><boxGeometry args={[.9, .018, .03]} /><meshBasicMaterial color={committed ? WRITE : '#405865'} toneMapped={false} /></mesh>

    {/* cpu_top gate is outside regfile; we is exactly rf_we. */}
    <group position={[-3.0, -1.85, .2]}>
      <Block position={[0, 0, .12]} size={[1.15, .36, .22]} color="#1a2c35" />
      <Probe position={[0, .02, .5]} title="cpu_top · we=rf_we" value={`reg_write ${regWrite ? 1 : 0} → rf_we ${we ? 1 : 0}`} color={CONTROL} progress={progress} labelHost={labelHost} />
    </group>
    <mesh position={[-1.05, -1.85, .42]}><boxGeometry args={[1.9, .018, .02]} /><meshBasicMaterial color={CONTROL} toneMapped={false} /></mesh>

    {selectedNode && <Probe position={[2.35, -2.2, .8]} title={`x${selected} · ${selectedNode.value}`} value={selectedFlags} color={selected === 0 ? '#b79255' : selected === rd && committed ? WRITE : DATA} progress={progress} labelHost={labelHost} />}
    {!selectedNode && <Probe position={[2.35, -2.2, .8]} title="寄存器检查" value={selectedFlags} color={DATA} progress={progress} labelHost={labelHost} />}
  </group>
}
function AluHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const cases = model.nodes.filter(item => item.id.startsWith('case-'))
  const activeIndex = cases.findIndex(item => item.active)
  const result = node(model, 'result'), a = node(model, 'a'), b = node(model, 'b'), op = node(model, 'op')
  const bValue = parseHex(b?.value)
  const shift = bValue === undefined ? undefined : bValue & 31
  const opIndex = op?.value ? Number.parseInt(op.value, 10) : -1
  const isShift = opIndex === 2 || opIndex === 6 || opIndex === 7
  const layouts = [
    { op: 0, x: -1.8, y: .75 }, { op: 1, x: -1.2, y: .75 },
    { op: 5, x: -.55, y: .75 }, { op: 8, x: .05, y: .75 }, { op: 9, x: .65, y: .75 },
    { op: 2, x: -1.8, y: -.15 }, { op: 6, x: -1.2, y: -.15 }, { op: 7, x: -.65, y: -.15 },
    { op: 3, x: .05, y: -.15 }, { op: 4, x: .65, y: -.15 },
  ]
  const activeCell = layouts.find(cell => cell.op === activeIndex)
  const line = (x1: number, x2: number, y: number, color: string, thick = .024) => <mesh position={[(x1 + x2) / 2, y, .4]}><boxGeometry args={[Math.abs(x2 - x1) + thick, thick, .028]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
  const vert = (x: number, y1: number, y2: number, color: string, thick = .024) => <mesh position={[x, (y1 + y2) / 2, .4]}><boxGeometry args={[thick, Math.abs(y2 - y1) + thick, .028]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>

  return <group>
    <Strip width={7.45} depth={.08} y={-2.3} color="#273c47" />

    <group position={[-2.78, .75, .2]}>
      <Block position={[0, 0, .12]} size={[.75, .34, .22]} color="#1b303a" emissive={DATA} />
      <Probe position={[0, .02, .45]} title="a ← MUX" value={a?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} compact />
    </group>
    <group position={[-2.78, -.15, .2]}>
      <Block position={[0, 0, .12]} size={[.75, .34, .22]} color="#1b303a" emissive={GOLD} />
      <Probe position={[0, .02, .45]} title="b ← MUX" value={b?.value ?? '—'} color={GOLD} progress={progress} labelHost={labelHost} compact />
    </group>

    <group position={[0, 1.55, .2]}>
      <Block position={[0, 0, .12]} size={[1.05, .3, .22]} color="#1a2c35" emissive={CONTROL} />
      <Probe position={[0, .02, .45]} title="op [3:0]" value={op?.value ?? '—'} color={CONTROL} progress={progress} labelHost={labelHost} compact />
    </group>

    <Probe position={[-1.5, 1.02, .8]} title="ARITH" value="ADD / SUB · 0/1" color={CONTROL} progress={progress} labelHost={labelHost} compact />
    <Probe position={[.05, 1.02, .8]} title="LOGIC" value="XOR / OR / AND · 5/8/9" color={CONTROL} progress={progress} labelHost={labelHost} compact />
    <Probe position={[-1.15, .28, .8]} title="SHIFT" value="b[4:0] · 2/6/7" color={CONTROL} progress={progress} labelHost={labelHost} compact />
    <Probe position={[.35, .28, .8]} title="COMPARE" value="signed/u · 3/4" color={CONTROL} progress={progress} labelHost={labelHost} compact />

    {layouts.map(cell => <group key={cell.op}>
      <Block position={[cell.x, cell.y, .18]} size={[.46, .26, .18]} color={cell.op === activeIndex ? '#214754' : '#142a34'} emissive={cell.op === activeIndex ? DATA : undefined} />
      <Probe position={[cell.x, cell.y, .45]} title={cases[cell.op]?.title ?? ''} value="" color={cell.op === activeIndex ? DATA : '#8a9da7'} progress={progress} labelHost={labelHost} compact />
    </group>)}

    {activeCell && <>
      {line(-2.405, activeCell.x - .3, .75, DATA)}
      {vert(activeCell.x - .3, .75, activeCell.y + .06, DATA)}
      {line(activeCell.x - .3, activeCell.x - .23, activeCell.y + .06, DATA)}
      {line(-2.405, activeCell.x - .38, -.15, GOLD)}
      {vert(activeCell.x - .38, -.15, activeCell.y - .06, GOLD)}
      {line(activeCell.x - .38, activeCell.x - .23, activeCell.y - .06, GOLD)}
      {vert(0, 1.4, 1.22, CONTROL)}
      {line(0, activeCell.x, 1.22, CONTROL)}
      {vert(activeCell.x, 1.22, activeCell.y + .13, CONTROL)}
      {line(activeCell.x + .23, 1.2, activeCell.y, DATA)}
      {vert(1.2, activeCell.y, .15, DATA)}
      {line(1.2, 2.13, .15, DATA)}
    </>}


    {(activeIndex === 6 || activeIndex === 7) && <Probe position={[-.1, -.55, .8]} title="移位差异" value="SRL logical >> · SRA arithmetic >>>" color={CONTROL} progress={progress} labelHost={labelHost} compact />}
    {(activeIndex === 3 || activeIndex === 4) && <Probe position={[.35, -.55, .8]} title="比较差异" value="SLT signed(a)<signed(b) · SLTU unsigned(a)<unsigned(b)" color={CONTROL} progress={progress} labelHost={labelHost} compact />}
    <group position={[-1.15, -1.0, .2]}>
      <Block position={[0, 0, .12]} size={[.7, .26, .22]} color={isShift ? '#1d3c48' : '#172b34'} emissive={isShift ? CONTROL : undefined} />
      <Probe position={[0, .02, .45]} title="b[4:0]" value={shift !== undefined ? `${shift} · ${shift.toString(2).padStart(5, '0')}` : '—'} color={isShift ? CONTROL : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    {vert(-1.15, -.87, -.34, isShift ? GOLD : '#405865')}
    {line(-1.8, -.65, -.34, isShift ? GOLD : '#405865')}
    {[-1.8, -1.2, -.65].map(x => <mesh key={`shift-tap-${x}`} position={[x, -.31, .4]}><boxGeometry args={[.018, .07, .028]} /><meshBasicMaterial color={isShift ? GOLD : '#405865'} toneMapped={false} /></mesh>)}
    {vert(-2.78, -.32, -1.0, isShift ? GOLD : '#405865')}
    {line(-2.78, -1.5, -1.0, isShift ? GOLD : '#405865')}

    <group position={[2.55, .15, .2]}>
      <Block position={[0, 0, .12]} size={[.85, .34, .22]} color="#1b3844" emissive={result?.active ? DATA : undefined} />
      <Probe position={[0, .02, .45]} title="result → WB / DMEM / NextPC" value={result?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} compact />
    </group>

    <Probe position={[1.8, -1.0, .8]} title="组合逻辑" value="无 clk / 无内部寄存器" color={CONTROL} progress={progress} labelHost={labelHost} compact />
  </group>
}
function DecoderHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const wordNode = node(model, 'word'), instrNode = node(model, 'instruction')
  const fieldNodes = ['opcode', 'funct3', 'funct7'].map(id => node(model, id))
  const alu = node(model, 'alu'), selects = node(model, 'selects'), memory = node(model, 'memory')
  const flow = node(model, 'flow'), system = node(model, 'system'), commit = node(model, 'commit')
  const word = parseHex(wordNode?.value)
  let op = instrNode?.value ?? '—', format = '—', asm = '—'
  if (word !== undefined) {
    try {
      const decoded = decode(word)
      format = instructionFormat(decoded.op)
      asm = assembly(decoded)
    } catch { format = '非法' }
  }
  const opcode = word !== undefined ? word & 0x7f : undefined
  const caseIndex = opcode === undefined ? -1
    : opcode === 0x37 || opcode === 0x17 ? 0 : opcode === 0x6f ? 1 : opcode === 0x67 ? 2
      : opcode === 0x63 ? 3 : opcode === 0x03 || opcode === 0x23 ? 4
        : opcode === 0x13 || opcode === 0x33 ? 5 : opcode === 0x0f ? 6 : opcode === 0x73 ? 7 : -1
  const last = useRef(''), flowGlow = useRef(1)
  const token = useRef<Mesh>(null), tokenMaterial = useRef<MeshBasicMaterial>(null)
  useFrame((_, dt) => {
    const signature = `${wordNode?.value ?? ''}|${alu?.value ?? ''}|${flow?.value ?? ''}|${commit?.value ?? ''}`
    if (last.current && signature !== last.current) flowGlow.current = 0
    last.current = signature
    flowGlow.current = Math.min(1, flowGlow.current + dt / .65)
    const path = [[-3.25, 1.65], [-2.4, 1.65], [-1.3, .5], [-.55, .5], [.75, .5], [1.5, .5], [2.0, .5], [2.0, -1.7], [3.2, -1.7]]
    const travel = smoothstep(0, 1, flowGlow.current) * (path.length - 1)
    const i = Math.min(path.length - 2, Math.floor(travel)), f = travel - i, to = path[i + 1]
    if (token.current) {
      token.current.visible = flowGlow.current > .002 && flowGlow.current < .998
      token.current.position.set(path[i][0] + (to[0] - path[i][0]) * f, path[i][1] + (to[1] - path[i][1]) * f, .68)
    }
    if (tokenMaterial.current) tokenMaterial.current.opacity = Math.sin(flowGlow.current * Math.PI) * .8
  })

  return <group>
    <Strip width={7.6} depth={.08} y={-2.35} color="#273c47" />


    {/* instr input and field extractors. */}
    <group position={[-3.38, 1.65, .2]}>
      <Block position={[0, 0, .18]} size={[.34, .62, .3]} color="#1d3541" />
      <mesh position={[.18, 0, .2]}><cylinderGeometry args={[.06, .06, .3, 14]} /><meshStandardMaterial color={GOLD} metalness={.9} roughness={.24} /></mesh>
    </group>
    <Bus x1={-3.22} x2={-2.8} y={1.65} color={DATA} />
    <group position={[-2.2, 1.65, .2]}>
      <Block position={[0, 0, .1]} size={[2.15, .32, .12]} color="#10232c" />
      {Array.from({ length: 32 }, (_, i) => <Cell key={i} position={[-1.02 + (31 - i) * .065, 0, .22]} active={word !== undefined && ((word >>> i) & 1) === 1} color={i < 7 ? CONTROL : i < 15 ? DATA : GOLD} size={[.048, .16, .04]} />)}
    </group>
    {[
      { id: 'opcode', y: 1.05, x: -3.05 },
      { id: 'funct3', y: .45, x: -3.05 },
      { id: 'funct7', y: -.15, x: -3.05 },
    ].map(field => <group key={field.id} position={[field.x, field.y, .2]}>
      <Block position={[0, 0, .16]} size={[.38, .28, .2]} color="#1d3541" />
      <Bus x1={.2} x2={.7} y={0} color={CONTROL} />
    </group>)}
    <mesh position={[-2.4, .45, .35]}><boxGeometry args={[.025, 1.15, .02]} /><meshBasicMaterial color={CONTROL} toneMapped={false} /></mesh>
    <Probe position={[-3.12, 1.85, .8]} title="instr [31:0]" value={wordNode?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[-2.6, .62, .8]} title="字段提取" value={`op ${fieldNodes[0]?.value ?? '—'}\nf3 ${fieldNodes[1]?.value ?? '—'}\nf7 ${fieldNodes[2]?.value ?? '—'}`} color={CONTROL} progress={progress} labelHost={labelHost} />

    {/* opcode case + type. */}
    <Block position={[-.55, .1, .16]} size={[1.05, 3.15, .24]} color="#0e222b" />
    {Array.from({ length: 8 }, (_, i) => <group key={i} position={[-.55, 1.32 - i * .37, .34]}>
      <RoundedBox args={[.74, .25, .12]} radius={.03} smoothness={2}>
        <meshStandardMaterial color={caseIndex === i ? '#2b5364' : '#172a33'} metalness={.65} roughness={.32} emissive={caseIndex === i ? CONTROL : '#010203'} emissiveIntensity={caseIndex === i ? .25 : .02} />
        <Edges color={caseIndex === i ? CONTROL : '#405b68'} threshold={22} />
      </RoundedBox>
      <mesh position={[.45, 0, .05]}><boxGeometry args={[.16, .025, .02]} /><meshBasicMaterial color={caseIndex === i ? CONTROL : '#344e5b'} toneMapped={false} /></mesh>
    </group>)}
    <Probe position={[-.55, 1.82, .8]} title="case(opcode)" value={opcode !== undefined ? `7'b${opcode.toString(2).padStart(7, '0')}` : '—'} color={CONTROL} progress={progress} labelHost={labelHost} />
    <Probe position={[-.55, -1.38, .8]} title="当前译码" value={`${op} · ${format}\n${asm}`} color={DATA} progress={progress} labelHost={labelHost} />


    {/* control groups and their downstream consumers. */}
    {[
      { id: 'alu', y: 1.5, title: 'ALU → ALU', value: alu?.value, active: !!alu?.active },
      { id: 'selects', y: .85, title: 'IMM / WB → ImmGen / WB', value: selects?.value, active: !!selects?.active },
      { id: 'mem', y: .2, title: 'MEM → Data Memory', value: memory?.value, active: !!memory?.active },
      { id: 'flow', y: -.45, title: 'FLOW → Branch / NextPC', value: flow?.value, active: !!flow?.active },
      { id: 'sys', y: -1.1, title: 'SYS → Trap / illegal', value: system?.value, active: !!system?.active },
      { id: 'commit', y: -1.75, title: 'reg_write → cpu_top gate', value: commit?.value, active: !!commit?.active },
    ].map(group => <group key={group.id} position={[1.8, group.y, .2]}>
      <Block position={[0, 0, .16]} size={[1.45, .34, .22]} color="#1a3039" emissive={group.active ? (group.id === 'commit' ? WRITE : CONTROL) : undefined} />
      <Bus x1={-1.1} x2={-.72} y={0} color={group.active ? (group.id === 'commit' ? WRITE : CONTROL) : '#405865'} />
      <Probe position={[.62, 0, .5]} title={group.title} value={group.value ?? '—'} color={group.id === 'commit' ? WRITE : CONTROL} progress={progress} labelHost={labelHost} />
    </group>)}
    <mesh position={[.65, .25, .4]}><boxGeometry args={[.025, 3.6, .02]} /><meshBasicMaterial color={CONTROL} toneMapped={false} /></mesh>

    {/* The top gate is outside decoder.v. */}
    <Probe position={[-2.95, -1.82, .8]} title="组合逻辑" value="无 clk / 无 FF" color={CONTROL} progress={progress} labelHost={labelHost} />

    <mesh ref={token} visible={false}><sphereGeometry args={[.07, 14, 8]} /><meshBasicMaterial ref={tokenMaterial} color={CONTROL} transparent depthWrite={false} /></mesh>
  </group>
}

function ImmediateHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const word = parseHex(node(model, 'word')?.value)
  const immValue = parseHex(node(model, 'imm')?.value)
  const selText = node(model, 'select')?.value ?? ''
  const format = (['I', 'S', 'B', 'U', 'J'].find(item => selText.includes(item)) ?? 'I') as ImmFormat
  const groups = immediateGroups(format, '#5f93a8', '#405a67')
  const step = .18, xStart = -2.79
  const arrayWidth = 31 * step + .2
  const arrayCenter = xStart + 31 * step / 2
  const xForBit = (bit: number) => xStart + (31 - bit) * step
  const groupCenter = (range: { msb: number; lsb: number }) => (xForBit(range.msb) + xForBit(range.lsb)) / 2
  const last = useRef(''), flow = useRef(1)
  const token = useRef<Mesh>(null), tokenMaterial = useRef<MeshBasicMaterial>(null)

  useFrame((_, dt) => {
    const signature = `${word ?? ''}|${selText}|${immValue ?? ''}`
    if (last.current && signature !== last.current) flow.current = 0
    last.current = signature
    flow.current = Math.min(1, flow.current + dt / .68)
    const lead = groups.find(group => group.kind === 'source') ?? groups[0]
    if (lead) {
      const inX = lead.input ? groupCenter(lead.input) : groupCenter(lead.output)
      const outX = groupCenter(lead.output)
      const path = [[inX, 1.3], [inX, .75], [outX, .75], [outX, -1.15]]
      const travel = smoothstep(0, 1, flow.current) * (path.length - 1)
      const i = Math.min(path.length - 2, Math.floor(travel)), f = travel - i, to = path[i + 1]
      if (token.current) {
        token.current.visible = flow.current > .002 && flow.current < .998
        token.current.position.set(path[i][0] + (to[0] - path[i][0]) * f, path[i][1] + (to[1] - path[i][1]) * f, .7)
        tokenMaterial.current?.color.set(lead.color)
      }
      if (tokenMaterial.current) tokenMaterial.current.opacity = Math.sin(flow.current * Math.PI) * .8
    }
  })

  return <group>
    <Strip width={7.6} depth={.08} y={-2.35} color="#273c47" />


    {/* instr[31:0] — fixed bit order, 31 at the left. */}
    <Block position={[arrayCenter, 1.55, .16]} size={[arrayWidth, .42, .16]} color="#0d222b" />
    {Array.from({ length: 32 }, (_, bit) => {
      const group = groups.find(item => item.kind === 'source' && item.input && bit <= item.input.msb && bit >= item.input.lsb)
      const color = group?.color ?? (groups.find(item => item.kind === 'sext' && item.input && bit === 31)?.color ?? '#324b58')
      return <Cell key={bit} position={[xForBit(bit), 1.55, .3]} active={word !== undefined && ((word >>> bit) & 1) === 1} color={color} size={[.13, .22, .05]} />
    })}
    {[31, 24, 16, 8, 0].map(bit => <Probe key={bit} position={[xForBit(bit), 1.8, .8]} title={String(bit)} value="" color="#7894a2" progress={progress} labelHost={labelHost} />)}

    {/* Group buses: brackets span exactly the input and output bits. */}
    {groups.map((group, index) => {
      const laneY = .8 - index * .38
      const inX = group.input ? groupCenter(group.input) : xForBit(group.output.msb)
      const outX = groupCenter(group.output)
      const inLeft = group.input ? xForBit(group.input.msb) - .045 : inX
      const inRight = group.input ? xForBit(group.input.lsb) + .045 : inX
      const outLeft = xForBit(group.output.msb) - .045
      const outRight = xForBit(group.output.lsb) + .045
      return <group key={group.key}>
        {group.input && <>
          <mesh position={[(inLeft + inRight) / 2, 1.33, .42]}><boxGeometry args={[Math.abs(inRight - inLeft), .022, .025]} /><meshBasicMaterial color={group.color} toneMapped={false} /></mesh>
          {Array.from({ length: group.input.msb - group.input.lsb + 1 }, (_, i) => <mesh key={`is-${i}`} position={[xForBit(group.input!.lsb + i), 1.385, .42]}><boxGeometry args={[.012, .11, .02]} /><meshBasicMaterial color={group.color} transparent opacity={.7} toneMapped={false} /></mesh>)}
          <mesh position={[inX, (1.33 + laneY) / 2, .42]}><boxGeometry args={[.022, Math.abs(1.33 - laneY), .025]} /><meshBasicMaterial color={group.color} toneMapped={false} /></mesh>
        </>}
        <mesh position={[(inX + outX) / 2, laneY, .42]}><boxGeometry args={[Math.abs(outX - inX) + .022, .022, .025]} /><meshBasicMaterial color={group.color} toneMapped={false} /></mesh>
        <mesh position={[outX, (laneY - 1.18) / 2, .42]}><boxGeometry args={[.022, Math.abs(laneY + 1.18), .025]} /><meshBasicMaterial color={group.color} toneMapped={false} /></mesh>
        <mesh position={[(outLeft + outRight) / 2, -1.18, .42]}><boxGeometry args={[Math.abs(outRight - outLeft), .022, .025]} /><meshBasicMaterial color={group.color} toneMapped={false} /></mesh>
        {Array.from({ length: group.output.msb - group.output.lsb + 1 }, (_, i) => <mesh key={`os-${i}`} position={[xForBit(group.output.lsb + i), -1.265, .42]}><boxGeometry args={[.012, .17, .02]} /><meshBasicMaterial color={group.color} transparent opacity={.7} toneMapped={false} /></mesh>)}
        <Probe position={[(inX + outX) / 2, laneY + .14, .8]} title={group.label} value="" color={group.color} progress={progress} labelHost={labelHost} />
        {group.kind === 'zero' && <mesh position={[outX, laneY - .14, .42]}><boxGeometry args={[.16, .025, .02]} /><meshBasicMaterial color={group.color} toneMapped={false} /></mesh>}
      </group>
    })}

    {/* imm[31:0] — same columns as instr, so the bus endpoints are traceable. */}
    <Block position={[arrayCenter, -1.45, .16]} size={[arrayWidth, .42, .16]} color="#0d222b" />
    {Array.from({ length: 32 }, (_, bit) => {
      const group = groups.find(item => bit <= item.output.msb && bit >= item.output.lsb)
      return <Cell key={`out-${bit}`} position={[xForBit(bit), -1.45, .3]} active={immValue !== undefined && ((immValue >>> bit) & 1) === 1} color={group?.color ?? '#324b58'} size={[.13, .22, .05]} />
    })}
    {[31, 24, 16, 8, 0].map(bit => <Probe key={`tick-${bit}`} position={[xForBit(bit), -1.64, .8]} title={String(bit)} value="" color="#7894a2" progress={progress} labelHost={labelHost} />)}


    <mesh ref={token} visible={false}><sphereGeometry args={[.07, 14, 8]} /><meshBasicMaterial ref={tokenMaterial} color={DATA} transparent depthWrite={false} /></mesh>
  </group>
}
function MuxHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const aSelText = node(model, 'a-sel')?.value ?? ''
  const bSelText = node(model, 'b-sel')?.value ?? ''
  const aSel = Number.parseInt(aSelText, 10)
  const bSel = Number.parseInt(bSelText, 10)
  const aInputs = [
    { id: 'a-rs1', y: 1.0, label: 'rs1_data [31:0]', short: 'A0 · rs1_data', index: 0 },
    { id: 'a-pc', y: .25, label: 'pc_value [31:0]', short: 'A1 · pc_value', index: 1 },
    { id: 'a-zero', y: -.5, label: "32'b0 [31:0]", short: "A2 · 32'b0", index: 2 },
  ].map(item => ({ ...item, node: node(model, item.id), active: aSel === item.index }))
  const bInputs = [
    { id: 'b-rs2', y: .65, label: 'rs2_data [31:0]', short: 'B0 · rs2_data', index: 0 },
    { id: 'b-imm', y: -.1, label: 'imm [31:0]', short: 'B1 · imm', index: 1 },
  ].map(item => ({ ...item, node: node(model, item.id), active: bSel === item.index }))
  const aOut = node(model, 'a-out'), bOut = node(model, 'b-out')
  const aBodyX = -1.05, bBodyX = 1.05
  const aOutY = .25, bOutY = .3
  const activeColor = DATA, idleColor = '#405865'
  const line = (x1: number, x2: number, y: number, color: string, thick = .022) => <mesh position={[(x1 + x2) / 2, y, .4]}><boxGeometry args={[Math.abs(x2 - x1) + thick, thick, .028]} /><meshBasicMaterial color={color} transparent opacity={color === idleColor ? .35 : .95} toneMapped={false} /></mesh>
  const vert = (x: number, y1: number, y2: number, color: string, thick = .022) => <mesh position={[x, (y1 + y2) / 2, .4]}><boxGeometry args={[thick, Math.abs(y2 - y1) + thick, .028]} /><meshBasicMaterial color={color} transparent opacity={color === idleColor ? .35 : .95} toneMapped={false} /></mesh>

  return <group>
    <Strip width={7.45} depth={.08} y={-2.3} color="#273c47" />
    <Probe position={[0, -1.75, .8]} title="组合逻辑" value="无 clk / 无内部寄存器" color={CONTROL} progress={progress} labelHost={labelHost} compact />

    {/* ALU A: 3:1 MUX, mirrored around the center. */}
    <Probe position={[aBodyX, 1.32, .8]} title="A MUX · 3:1" value="rs1 / PC / 0" color={DATA} progress={progress} labelHost={labelHost} compact />
    <Block position={[aBodyX, .25, .2]} size={[.95, 1.95, .24]} color="#162c36" />
    {aInputs.map(item => <group key={item.id}>
      <group position={[-2.55, item.y, .2]}>
        <Block position={[0, 0, .12]} size={[.86, .38, .24]} color={item.active ? '#1d3c48' : '#172b34'} emissive={item.active ? DATA : undefined} />
        <Probe position={[0, .02, .45]} title={item.short} value={item.node?.value ?? '—'} color={item.active ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
      </group>
      {line(-2.12, -1.54, item.y, item.active ? activeColor : idleColor, .024)}
      {line(-1.52, aBodyX, item.y, item.active ? activeColor : idleColor, .024)}
      {item.active && <>
        {vert(aBodyX, item.y, aOutY, activeColor, .026)}
        {line(aBodyX, -.58, aOutY, activeColor, .026)}
      </>}
    </group>)}
    {line(-2.55, -1.05, -1.06, CONTROL, .022)}
    {vert(aBodyX, -1.06, -.75, aSel === 0 || aSel === 1 || aSel === 2 ? CONTROL : idleColor, .022)}

    {/* ALU B: 2:1 MUX. */}
    <Probe position={[bBodyX, 1.32, .8]} title="B MUX · 2:1" value="rs2 / imm" color={CONTROL} progress={progress} labelHost={labelHost} compact />
    <Block position={[bBodyX, .3, .2]} size={[.95, 1.45, .24]} color="#162c36" />
    {bInputs.map(item => <group key={item.id}>
      <group position={[2.55, item.y, .2]}>
        <Block position={[0, 0, .12]} size={[.86, .38, .24]} color={item.active ? '#1d3c48' : '#172b34'} emissive={item.active ? CONTROL : undefined} />
        <Probe position={[0, .02, .45]} title={item.short} value={item.node?.value ?? '—'} color={item.active ? CONTROL : '#8297a3'} progress={progress} labelHost={labelHost} compact />
      </group>
      {line(2.12, 1.54, item.y, item.active ? activeColor : idleColor, .024)}
      {line(1.52, bBodyX, item.y, item.active ? activeColor : idleColor, .024)}
      {item.active && <>
        {vert(bBodyX, item.y, bOutY, activeColor, .026)}
        {line(bBodyX, .58, bOutY, activeColor, .026)}
      </>}
    </group>)}
    {line(2.55, 1.05, -1.06, CONTROL, .022)}
    {vert(bBodyX, -1.06, -.45, bSel === 0 || bSel === 1 ? CONTROL : idleColor, .022)}

    {/* Outputs toward ALU. */}
    <group position={[-.7, -1.0, .2]}>
      <Block position={[0, 0, .12]} size={[.56, .28, .22]} color="#1b3844" emissive={aOut?.active ? DATA : undefined} />
      <Probe position={[0, .02, .45]} title="alu_a → ALU A" value={aOut?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} compact />
    </group>
    {line(-.58, -.7, aOutY, DATA, .026)}
    {vert(-.7, aOutY, -.86, DATA, .026)}
    <group position={[.7, -1.0, .2]}>
      <Block position={[0, 0, .12]} size={[.56, .28, .22]} color="#1b3844" emissive={bOut?.active ? DATA : undefined} />
      <Probe position={[0, .02, .45]} title="alu_b → ALU B" value={bOut?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} compact />
    </group>
    {line(.58, .7, bOutY, DATA, .026)}
    {vert(.7, bOutY, -.86, DATA, .026)}

    {/* Select controls. */}
    <group position={[-2.55, -1.22, .2]}>
      <Block position={[0, 0, .12]} size={[.78, .28, .22]} color="#1a2c35" emissive={CONTROL} />
      <Probe position={[0, .02, .45]} title="alu_a_sel [1:0]" value={aSelText || '—'} color={CONTROL} progress={progress} labelHost={labelHost} compact />
    </group>
    <group position={[2.55, -1.22, .2]}>
      <Block position={[0, 0, .12]} size={[.78, .28, .22]} color="#1a2c35" emissive={CONTROL} />
      <Probe position={[0, .02, .45]} title="alu_b_imm" value={bSelText || '—'} color={CONTROL} progress={progress} labelHost={labelHost} compact />
    </group>



  </group>
}
function BranchHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const a = node(model, 'a'), b = node(model, 'b'), op = node(model, 'op')
  const taken = node(model, 'taken'), branch = node(model, 'branch'), jump = node(model, 'jump'), redirect = node(model, 'redirect')
  const aValue = parseHex(a?.value), bValue = parseHex(b?.value)
  const aSigned = aValue === undefined ? undefined : aValue | 0
  const bSigned = bValue === undefined ? undefined : bValue | 0
  const aUnsigned = aValue === undefined ? undefined : aValue >>> 0
  const bUnsigned = bValue === undefined ? undefined : bValue >>> 0
  const opCode = op?.value ? Number.parseInt(op.value, 10) : -1
  const isBranch = branch?.value === '1'
  const isJump = jump?.value === '1'
  const isRedirect = redirect?.value === '1'
  const cases = [
    { code: 0, name: 'BEQ', group: 'EQUAL', expr: 'a == b' },
    { code: 1, name: 'BNE', group: 'EQUAL', expr: 'a != b' },
    { code: 4, name: 'BLT', group: 'SIGNED', expr: 'signed(a) < signed(b)' },
    { code: 5, name: 'BGE', group: 'SIGNED', expr: 'signed(a) >= signed(b)' },
    { code: 6, name: 'BLTU', group: 'UNSIGNED', expr: 'a < b' },
    { code: 7, name: 'BGEU', group: 'UNSIGNED', expr: 'a >= b' },
  ]
  const active = isBranch ? cases.find(row => row.code === opCode) : undefined
  const groups = [
    { name: 'EQUAL', x: -1.4, hint: '== / !=', cases: [0, 1] },
    { name: 'SIGNED', x: -.4, hint: 'signed < / >=', cases: [4, 5] },
    { name: 'UNSIGNED', x: .6, hint: 'unsigned < / >=', cases: [6, 7] },
  ]
  const cell = (code: number) => {
    const row = cases.find(item => item.code === code)!
    const group = groups.find(item => item.cases.includes(code))!
    const index = group.cases.indexOf(code)
    return { ...row, x: group.x, y: .55 - index * .6 }
  }
  const activeCell = active ? cell(active.code) : undefined
  const line = (x1: number, x2: number, y: number, color: string, thick = .024) => <mesh position={[(x1 + x2) / 2, y, .4]}><boxGeometry args={[Math.abs(x2 - x1) + thick, thick, .028]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
  const vert = (x: number, y1: number, y2: number, color: string, thick = .024) => <mesh position={[x, (y1 + y2) / 2, .4]}><boxGeometry args={[thick, Math.abs(y2 - y1) + thick, .028]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>

  return <group>
    <Strip width={7.45} depth={.08} y={-2.3} color="#273c47" />

    <group position={[-2.7, .9, .2]}>
      <Block position={[0, 0, .12]} size={[.9, .36, .22]} color={isBranch ? '#1d3c48' : '#172b34'} emissive={isBranch ? DATA : undefined} />
      <Probe position={[0, .02, .45]} title="a · rs1_data" value={a?.value ?? '—'} color={isBranch ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    <group position={[-2.7, -.05, .2]}>
      <Block position={[0, 0, .12]} size={[.9, .36, .22]} color={isBranch ? '#1d3c48' : '#172b34'} emissive={isBranch ? GOLD : undefined} />
      <Probe position={[0, .02, .45]} title="b · rs2_data" value={b?.value ?? '—'} color={isBranch ? GOLD : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    <Probe position={[-2.7, -1.0, .8]} title="A/B 两种解释" value={aSigned === undefined || bSigned === undefined ? '—' : `signed ${aSigned} / ${bSigned}\nunsigned ${aUnsigned} / ${bUnsigned}\nmsb ${aValue! >>> 31} / ${bValue! >>> 31}`} color={isBranch ? CONTROL : '#8297a3'} progress={progress} labelHost={labelHost} />

    <group position={[-.4, 1.55, .2]}>
      <Block position={[0, 0, .12]} size={[1.05, .3, .22]} color="#1a2c35" emissive={isBranch ? CONTROL : undefined} />
      <Probe position={[0, .02, .45]} title="branch_op [2:0]" value={op?.value ?? '—'} color={isBranch ? CONTROL : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>

    {groups.map(group => <Probe key={group.name} position={[group.x, 1.05, .8]} title={group.name} value={group.hint} color={CONTROL} progress={progress} labelHost={labelHost} compact />)}
    {groups.flatMap(group => group.cases.map(code => { const row = cell(code); return <group key={code}>
      <Block position={[row.x, row.y, .18]} size={[.55, .28, .18]} color={row.code === active?.code ? '#214754' : '#142a34'} emissive={row.code === active?.code ? DATA : undefined} />
      <Probe position={[row.x, row.y, .45]} title={row.name} value="" color={row.code === active?.code ? DATA : '#8a9da7'} progress={progress} labelHost={labelHost} compact />
    </group> }))}

    {activeCell && <>
      {line(-2.25, activeCell.x - .28, .9, DATA, .03)}
      {vert(activeCell.x - .28, .9, activeCell.y + .06, DATA, .03)}
      {line(activeCell.x - .28, activeCell.x - .23, activeCell.y + .06, DATA, .03)}
      {line(-2.25, activeCell.x - .36, -.05, GOLD, .03)}
      {vert(activeCell.x - .36, -.05, activeCell.y - .06, GOLD, .03)}
      {line(activeCell.x - .36, activeCell.x - .23, activeCell.y - .06, GOLD, .03)}
      {vert(-.4, 1.38, 1.16, CONTROL, .024)}
      {line(-.4, activeCell.x, 1.16, CONTROL, .024)}
      {vert(activeCell.x, 1.16, activeCell.y + .14, CONTROL, .024)}
      {line(activeCell.x + .23, 1.8, activeCell.y, DATA, .028)}
      {vert(1.8, activeCell.y, .2, DATA, .028)}
    </>}
    <group position={[1.95, .2, .2]}>
      <Block position={[0, 0, .12]} size={[.8, .34, .22]} color={isBranch ? '#1d3c48' : '#172b34'} emissive={isBranch && taken?.value === '1' ? DATA : undefined} />
      <Probe position={[0, .02, .45]} title="taken" value={`${taken?.value ?? '—'}${isBranch ? '' : ' · 未使能'}`} color={isBranch ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>

    <group position={[1.95, -.95, .2]}>
      <Block position={[0, 0, .12]} size={[.95, .4, .22]} color={isRedirect ? '#1d3c48' : '#172b34'} emissive={isRedirect ? WRITE : undefined} />
      <Probe position={[0, .02, .45]} title="cpu_top redirect" value={`branch ${branch?.value ?? '—'} · jump ${jump?.value ?? '—'}\n→ redirect ${redirect?.value ?? '—'}`} color={isRedirect ? WRITE : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    {vert(1.95, .03, -.75, isBranch ? DATA : '#405865', .024)}

    {!isBranch && <Probe position={[-.4, -1.3, .8]} title="非分支" value={isJump ? 'jump 路径绕开 Branch Unit' : '比较未使能 · taken 不参与'} color={CONTROL} progress={progress} labelHost={labelHost} compact />}
  </group>
}
function MemoryHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const address = node(model, 'address'), route = node(model, 'route'), control = node(model, 'control')
  const ram = node(model, 'ram'), after = node(model, 'after'), mmio = node(model, 'mmio')
  const read = node(model, 'read'), load = node(model, 'load'), write = node(model, 'write')
  const strobes = node(model, 'strobes'), memRead = node(model, 'mem-read'), memWrite = node(model, 'mem-write')
  const sizeNode = node(model, 'mem-size'), unsignedNode = node(model, 'load-unsigned')
  const addr = parseHex(address?.value)
  const readWordValue = parseHex(read?.value), loadValue = parseHex(load?.value), writeValue = parseHex(write?.value)
  const readMode = memRead?.value === '1'
  const writeMode = memWrite?.value?.startsWith('1') ?? false
  const size = sizeNode?.value ? Number.parseInt(sizeNode.value, 10) : 0
  const unsigned = unsignedNode?.value === '1'
  const ramActive = !!ram?.active
  const mmioActive = !!mmio?.active
  const accessActive = !!route?.active
  const isStore = writeMode && accessActive
  const isLoad = readMode && accessActive && ramActive
  const lane = addr === undefined ? 0 : addr & 3
  const bytes = 1 << size
  const wstrb = strobes?.value ? Number.parseInt(strobes.value, 2) : 0
  const displayWord = ramActive ? parseHex(isStore ? after?.value : ram?.value) : undefined
  const laneBytes = Array.from({ length: 4 }, (_, i) => displayWord === undefined ? undefined : (displayWord >>> (i * 8)) & 255)
  const loadType = size === 0 ? (unsigned ? 'LBU' : 'LB') : size === 1 ? (unsigned ? 'LHU' : 'LH') : 'LW'
  const storeType = size === 0 ? 'SB' : size === 1 ? 'SH' : 'SW'
  const laneActive = (i: number) => ramActive && (isStore ? !!(wstrb & (1 << i)) : isLoad && i >= lane && i < lane + bytes)
  const laneX = (i: number) => -1.1 + i * .48
  const line = (x1: number, x2: number, y: number, color: string, thick = .024) => <mesh position={[(x1 + x2) / 2, y, .4]}><boxGeometry args={[Math.abs(x2 - x1) + thick, thick, .028]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
  const vert = (x: number, y1: number, y2: number, color: string, thick = .024) => <mesh position={[x, (y1 + y2) / 2, .4]}><boxGeometry args={[thick, Math.abs(y2 - y1) + thick, .028]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>

  return <group>
    <Strip width={7.45} depth={.08} y={-2.3} color="#273c47" />

    <group position={[-2.7, 1.0, .2]}>
      <Block position={[0, 0, .12]} size={[.9, .34, .22]} color={accessActive ? '#1d3c48' : '#172b34'} emissive={accessActive ? DATA : undefined} />
      <Probe position={[0, .02, .45]} title="dmem_addr" value={address?.value ?? '—'} color={accessActive ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    <group position={[-2.7, .05, .2]}>
      <Block position={[0, 0, .12]} size={[.9, .34, .22]} color="#1a2c35" />
      <Probe position={[0, .02, .45]} title="R/W · size · U" value={control?.value ?? '—'} color={accessActive ? CONTROL : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    <group position={[-2.7, -.85, .2]}>
      <Block position={[0, 0, .12]} size={[.9, .32, .22]} color={isStore ? '#1d3c48' : '#172b34'} emissive={isStore ? GOLD : undefined} />
      <Probe position={[0, .02, .45]} title="dmem_wdata" value={writeValue === undefined ? '—' : `0x${writeValue.toString(16).padStart(8, '0')}`} color={isStore ? GOLD : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    <group position={[-2.7, -1.45, .2]}>
      <Block position={[0, 0, .12]} size={[.9, .28, .22]} color={isStore ? '#1d3c48' : '#172b34'} emissive={isStore ? WRITE : undefined} />
      <Probe position={[0, .02, .45]} title="dmem_wstrb" value={strobes?.value ?? '—'} color={isStore ? WRITE : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>

    <group position={[-1.5, 1.0, .2]}>
      <Block position={[0, 0, .12]} size={[.6, .32, .22]} color="#1a2c35" emissive={accessActive ? CONTROL : undefined} />
      <Probe position={[0, .02, .45]} title="路由" value={mmioActive ? 'MMIO' : ramActive ? 'RAM' : '无访存'} color={accessActive ? CONTROL : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    {line(-2.25, -1.8, 1.0, accessActive ? CONTROL : '#405865', .024)}
    {line(-1.2, -.55, 1.0, ramActive ? DATA : '#405865', .024)}
    {vert(-.55, 1.0, .61, ramActive ? DATA : '#405865', .024)}
    {vert(-1.5, .84, -.72, mmioActive ? WRITE : '#405865', .024)}
    {line(-1.5, 1.85, -.72, mmioActive ? WRITE : '#405865', .024)}

    <group position={[-.35, .25, .2]}>
      <Block position={[0, 0, .12]} size={[2.0, .72, .2]} color="#142a34" emissive={ramActive ? DATA : undefined} />
      {[0, 1, 2, 3].map(i => <group key={i} position={[laneX(i) + .35, 0, .2]}>
        <Block position={[0, 0, .12]} size={[.4, .52, .18]} color={laneActive(i) ? '#224b58' : '#18303a'} emissive={laneActive(i) ? DATA : undefined} />
        <Probe position={[0, .02, .45]} title={`B${i}`} value={laneBytes[i] === undefined ? '—' : `0x${laneBytes[i].toString(16).padStart(2, '0')}`} color={laneActive(i) ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
      </group>)}
      <Probe position={[0, .55, .8]} title="RAM word" value={addr !== undefined ? `0x${(addr - addr % 4).toString(16).padStart(8, '0')}` : '—'} color={ramActive ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
      <Probe position={[0, -.42, .8]} title="小端字节" value={addr !== undefined ? `+0 · +1 · +2 · +3 · low2=${addr & 3}` : '—'} color={ramActive ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>

    <group position={[1.35, 1.0, .2]}>
      <Block position={[0, 0, .12]} size={[.8, .34, .22]} color={isLoad ? '#1d3c48' : '#172b34'} emissive={isLoad ? DATA : undefined} />
      <Probe position={[0, .02, .45]} title="dmem_rdata" value={readWordValue === undefined ? '—' : `0x${readWordValue.toString(16).padStart(8, '0')}`} color={isLoad ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    <group position={[1.35, .15, .2]}>
      <Block position={[0, 0, .12]} size={[.8, .34, .22]} color={isLoad ? '#1d3c48' : '#172b34'} emissive={isLoad ? CONTROL : undefined} />
      <Probe position={[0, .02, .45]} title={`lane >> + ${unsigned ? 'zero' : 'sign'} ext`} value={isLoad ? `${loadType} · >>${lane * 8}` : '未读取'} color={isLoad ? CONTROL : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    <group position={[2.55, .15, .2]}>
      <Block position={[0, 0, .12]} size={[.65, .34, .22]} color={isLoad ? '#1d3c48' : '#172b34'} emissive={isLoad ? DATA : undefined} />
      <Probe position={[0, .02, .45]} title="load_data" value={loadValue === undefined ? '—' : `0x${loadValue.toString(16).padStart(8, '0')}`} color={isLoad ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    {line(.65, 1.0, .25, isLoad ? DATA : '#405865', .024)}
    {vert(1.0, .25, 1.0, isLoad ? DATA : '#405865', .024)}
    {line(.95, 1.0, 1.0, isLoad ? DATA : '#405865', .024)}
    {vert(1.35, .84, .32, isLoad ? DATA : '#405865', .024)}
    {line(1.75, 2.2, .15, isLoad ? DATA : '#405865', .024)}

    {ramActive && isStore && <>
      {line(-2.25, -1.35, -.85, GOLD, .026)}
      {vert(-1.35, -.85, .25, GOLD, .026)}
      {line(-2.25, -1.35, -1.45, WRITE, .026)}
      {vert(-1.35, -1.45, .25, WRITE, .026)}
    </>}
    {mmioActive && isStore && <>
      {line(-2.25, -1.55, -.85, GOLD, .026)}
      {vert(-1.55, -.85, -.72, GOLD, .026)}
      {line(-1.55, 1.85, -.72, GOLD, .026)}
      {line(-2.25, -1.55, -1.45, WRITE, .026)}
      {vert(-1.55, -1.45, -.72, WRITE, .026)}
    </>}

    <group position={[2.3, -.85, .2]}>
      <Block position={[0, 0, .12]} size={[.85, .4, .22]} color={mmioActive ? '#2d3034' : '#172b34'} emissive={mmioActive ? WRITE : undefined} />
      <Probe position={[0, .02, .45]} title="MMIO Display" value={mmio?.value ?? '本条未访问设备'} color={mmioActive ? WRITE : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>

    <group position={[.3, -1.35, .2]}>
      <Block position={[0, 0, .12]} size={[1.55, .34, .22]} color={isStore ? '#1d3c48' : '#172b34'} emissive={isStore ? WRITE : undefined} />
      <Probe position={[0, .02, .45]} title="dmem_we · 提交" value={isStore ? `${storeType} · ${mmioActive ? 'MMIO 写入' : 'RAM 写入'} · wstrb ${strobes?.value ?? '—'}` : isLoad ? '读操作 · 无写回' : '本条未访存'} color={isStore ? WRITE : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
  </group>
}
function WritebackHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const selectText = node(model, 'select')?.value ?? ''
  const select = Number.parseInt(selectText, 10)
  const alu = node(model, 'alu'), memory = node(model, 'memory'), pc4 = node(model, 'pc4')
  const data = node(model, 'data'), regWrite = node(model, 'reg-write'), conditions = node(model, 'conditions')
  const rfWe = node(model, 'rf-we'), rd = node(model, 'rd'), commit = node(model, 'commit')
  const committed = !!commit?.active
  const rf = rfWe?.value === '1'
  const cond = (conditions?.value ?? '').split(' / ')
  const trap = cond[0] ?? '—', fault = cond[1] ?? '—'
  const inputs = [
    { id: 'alu', y: 1.0, title: '0 · alu_result', node: alu },
    { id: 'memory', y: .05, title: '1 · load_data', node: memory },
    { id: 'pc4', y: -.9, title: '2 · pc_plus4', node: pc4 },
  ]
  const activeInput = inputs.find(item => item.id === ['alu', 'memory', 'pc4'][select])
  const line = (x1: number, x2: number, y: number, color: string, thick = .024) => <mesh position={[(x1 + x2) / 2, y, .4]}><boxGeometry args={[Math.abs(x2 - x1) + thick, thick, .028]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>
  const vert = (x: number, y1: number, y2: number, color: string, thick = .024) => <mesh position={[x, (y1 + y2) / 2, .4]}><boxGeometry args={[thick, Math.abs(y2 - y1) + thick, .028]} /><meshBasicMaterial color={color} toneMapped={false} /></mesh>

  return <group>
    <Strip width={7.45} depth={.08} y={-2.3} color="#273c47" />

    <Probe position={[-.8, 1.55, .8]} title="wb_sel [1:0]" value={selectText || '—'} color={CONTROL} progress={progress} labelHost={labelHost} compact />
    <Probe position={[-.8, 1.28, .8]} title="3:1 WB MUX" value="ALU / MEM / PC+4" color={CONTROL} progress={progress} labelHost={labelHost} compact />

    {inputs.map(item => <group key={item.id}>
      <group position={[-2.7, item.y, .2]}>
        <Block position={[0, 0, .12]} size={[.88, .36, .22]} color={item.node?.active ? '#1d3c48' : '#172b34'} emissive={item.node?.active ? DATA : undefined} />
        <Probe position={[0, .02, .45]} title={item.title} value={item.node?.value ?? '—'} color={item.node?.active ? DATA : '#8297a3'} progress={progress} labelHost={labelHost} compact />
      </group>
      {line(-2.26, -1.26, item.y, item.node?.active ? DATA : '#405865', .026)}
    </group>)}

    <Block position={[-.8, .05, .18]} size={[.9, 2.15, .22]} color="#162c36" />
    {activeInput && <>
      {line(-.8, -.38, activeInput.y, DATA, .03)}
      {vert(-.8, activeInput.y, .05, DATA, .03)}
      {line(-.8, -.38, .05, DATA, .03)}
    </>}
    {vert(-.8, 1.38, 1.14, CONTROL, .022)}

    <group position={[.3, .05, .2]}>
      <Block position={[0, 0, .12]} size={[.62, .36, .22]} color="#1b3844" emissive={DATA} />
      <Probe position={[0, .02, .45]} title="wb_data" value={data?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} compact />
    </group>
    {line(-.35, -.01, .05, DATA, .03)}

    <group position={[1.4, .05, .2]}>
      <Block position={[0, 0, .12]} size={[.9, .4, .22]} color="#1b3844" emissive={rf ? WRITE : undefined} />
      <Probe position={[0, .02, .45]} title="RF.rd_data" value={`${rd?.value ?? '—'} ← wb_data`} color={rf ? WRITE : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>
    {line(.61, .95, .05, DATA, .03)}
    {vert(1.4, -.85, -.15, rf ? WRITE : '#405865', .03)}
    {line(-.1, 1.4, -.85, rf ? WRITE : '#405865', .03)}

    <group position={[-1.1, -1.12, .2]}>
      <Block position={[0, 0, .12]} size={[1.85, .42, .22]} color="#1a2c35" emissive={rf ? WRITE : undefined} />
      <Probe position={[0, .02, .45]} title="写使能" value={`reg_write ${regWrite?.value ?? '—'} · trap ${trap} · fault ${fault}\n!reset 未采样 → rf_we ${rf ? 1 : 0}`} color={rf ? WRITE : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>

    <group position={[2.65, -1.12, .2]}>
      <Block position={[0, 0, .12]} size={[.9, .42, .22]} color={committed ? '#1d3c48' : '#172b34'} emissive={committed ? WRITE : undefined} />
      <Probe position={[0, .02, .45]} title="clk↑ 提交" value={commit?.value ?? '—'} color={committed ? WRITE : '#8297a3'} progress={progress} labelHost={labelHost} compact />
    </group>


  </group>
}
function NextPcHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  const pc = node(model, 'pc'), imm = node(model, 'imm'), alu = node(model, 'alu')
  const pc4 = node(model, 'pc4'), relative = node(model, 'relative'), jalr = node(model, 'jalr')
  const redirect = node(model, 'redirect'), normal = node(model, 'normal'), trap = node(model, 'trap'), next = node(model, 'next')
  const pc4Active = !!pc4?.active, relativeActive = !!relative?.active, jalrActive = !!jalr?.active
  const trapActive = !!trap?.active, redirectActive = relativeActive || jalrActive
  const last = useRef(''), flow = useRef(1)
  const token = useRef<Mesh>(null), tokenMaterial = useRef<MeshBasicMaterial>(null)

  useFrame((_, dt) => {
    const signature = `${pc?.value}|${imm?.value}|${alu?.value}|${pc4?.value}|${relative?.value}|${jalr?.value}|${redirect?.value}|${normal?.value}|${trap?.active}|${next?.value}`
    if (last.current && signature !== last.current) flow.current = 0
    last.current = signature
    flow.current = Math.min(1, flow.current + dt / .72)
    const path = trapActive ? [[-3.25, 1.55], [-3.25, -1.9], [2.35, -1.9], [2.35, .35], [3.18, .35]]
      : jalrActive ? [[-3.25, -1.2], [-1.9, -1.2], [-.45, -1.2], [-.1, -.55], [1.05, .95], [1.9, .35], [2.35, .35], [3.18, .35]]
        : redirectActive ? [[-3.25, 1.55], [-2.8, 1.55], [-2.8, .15], [-1.9, .15], [-.45, .15], [-.1, -.55], [1.05, .95], [1.9, .35], [2.35, .35], [3.18, .35]]
          : [[-3.25, 1.55], [-1.9, 1.55], [.9, 1.55], [1.05, .95], [1.9, .35], [2.35, .35], [3.18, .35]]
    const travel = smoothstep(0, 1, flow.current) * (path.length - 1)
    const index = Math.min(path.length - 2, Math.floor(travel))
    const fraction = travel - index
    const to = path[index + 1] ?? path[index]
    if (token.current) {
      token.current.visible = flow.current > .002 && flow.current < .998
      token.current.position.set(path[index][0] + (to[0] - path[index][0]) * fraction, path[index][1] + (to[1] - path[index][1]) * fraction, .68)
    }
    if (tokenMaterial.current) tokenMaterial.current.opacity = Math.sin(flow.current * Math.PI) * .85
  })

  return <group>
    <Strip width={7.6} depth={.08} y={-2.35} color="#273c47" />


    {/* Inputs from PC.Q, imm_gen and ALU. */}
    {[
      { id: 'pc', x: -3.4, y: 1.55 },
      { id: 'imm', x: -3.4, y: .15 },
      { id: 'alu', x: -3.4, y: -1.2 },
    ].map(input => <group key={input.id} position={[input.x, input.y, .2]}>
      <Block position={[0, 0, .18]} size={[.36, .72, .3]} color="#1d3541" />
      <mesh position={[.2, 0, .2]}><cylinderGeometry args={[.065, .065, .34, 14]} /><meshStandardMaterial color={GOLD} metalness={.9} roughness={.24} /></mesh>
    </group>)}

    {/* Three candidate values. */}
    {[
      { id: 'pc4', y: 1.55, active: pc4Active },
      { id: 'relative', y: .15, active: relativeActive },
      { id: 'jalr', y: -1.2, active: jalrActive },
    ].map(item => <group key={item.id} position={[-1.9, item.y, .2]}>
      <Block position={[0, 0, .18]} size={[1.15, .48, .3]} color="#18313c" emissive={item.active ? DATA : undefined} />
      <mesh position={[0, -.32, .4]}><boxGeometry args={[.8, .025, .02]} /><meshBasicMaterial color={item.active ? DATA : '#3d5866'} toneMapped={false} /></mesh>
      {item.id !== 'jalr' && <group position={[0, 0, .5]}>
        <mesh><boxGeometry args={[.26, .028, .02]} /><meshBasicMaterial color={item.active ? GOLD : '#6a604e'} toneMapped={false} /></mesh>
        <mesh><boxGeometry args={[.028, .2, .02]} /><meshBasicMaterial color={item.active ? GOLD : '#6a604e'} toneMapped={false} /></mesh>
      </group>}
    </group>)}

    {/* Input buses. */}
    <Bus x1={-3.22} x2={-2.48} y={1.55} color={pc4Active ? DATA : '#405865'} />
    <Bus x1={-3.22} x2={-2.48} y={.15} color={relativeActive ? DATA : '#405865'} />
    <Bus x1={-3.22} x2={-2.48} y={-1.2} color={jalrActive ? WRITE : '#405865'} />
    <mesh position={[-2.8, .85, .4]}><boxGeometry args={[.025, 1.4, .02]} /><meshBasicMaterial color={relativeActive ? DATA : '#405865'} toneMapped={false} /></mesh>

    {/* target = jalr ? {alu_result[31:1],1'b0} : pc_value + imm */}
    <Mux position={[-.1, -.55, .2]} inputs={2} color={CONTROL} />
    <Bus x1={-1.32} x2={-.55} y={.15} color={relativeActive ? DATA : '#405865'} />
    <mesh position={[-.45, -.25, .4]}><boxGeometry args={[.025, .65, .02]} /><meshBasicMaterial color={relativeActive ? DATA : '#405865'} toneMapped={false} /></mesh>
    <Bus x1={-1.32} x2={-.55} y={-1.2} color={jalrActive ? WRITE : '#405865'} />
    <mesh position={[-.45, -.85, .4]}><boxGeometry args={[.025, .55, .02]} /><meshBasicMaterial color={jalrActive ? WRITE : '#405865'} toneMapped={false} /></mesh>

    {/* normal_next_pc = redirect ? target : pc_plus4 */}
    <Mux position={[1.05, .95, .2]} inputs={2} color={CONTROL} />
    <Bus x1={.26} x2={.55} y={-.55} color={redirectActive ? DATA : '#405865'} />
    <mesh position={[.58, .2, .4]}><boxGeometry args={[.025, 1.15, .02]} /><meshBasicMaterial color={redirectActive ? DATA : '#405865'} toneMapped={false} /></mesh>
    <Bus x1={-.78} x2={.55} y={1.55} color={!redirectActive ? DATA : '#405865'} />
    <mesh position={[.58, 1.25, .4]}><boxGeometry args={[.025, .45, .02]} /><meshBasicMaterial color={!redirectActive ? DATA : '#405865'} toneMapped={false} /></mesh>

    {/* next_pc = (trap||fault) ? pc_value : normal_next_pc */}
    <Mux position={[2.35, .35, .2]} inputs={2} color={CONTROL} />
    <Bus x1={1.42} x2={1.95} y={.95} color={!trapActive ? DATA : '#405865'} />
    <mesh position={[1.98, .65, .4]}><boxGeometry args={[.025, .55, .02]} /><meshBasicMaterial color={!trapActive ? DATA : '#405865'} toneMapped={false} /></mesh>
    <Bus x1={2.66} x2={3.2} y={.35} color={DATA} />

    {/* PC value is the hold input for trap/fault. */}
    <mesh position={[-3.25, -.12, .4]}><boxGeometry args={[.025, 2.85, .02]} /><meshBasicMaterial color={trapActive ? DATA : '#405865'} toneMapped={false} /></mesh>
    <Bus x1={-3.25} x2={2.35} y={-1.9} color={trapActive ? DATA : '#405865'} />
    <mesh position={[2.35, -1.1, .4]}><boxGeometry args={[.025, 1.55, .02]} /><meshBasicMaterial color={trapActive ? DATA : '#405865'} toneMapped={false} /></mesh>

    {/* Control terminals. */}
    <Block position={[-.1, -1.36, .2]} size={[1.0, .28, .24]} color="#26333b" emissive={jalrActive ? CONTROL : undefined} />
    <Block position={[1.05, 1.72, .2]} size={[1.0, .28, .24]} color="#26333b" emissive={redirectActive ? CONTROL : undefined} />
    <Block position={[2.35, -.5, .2]} size={[1.0, .28, .24]} color="#26333b" emissive={trapActive ? CONTROL : undefined} />
    <mesh position={[-.1, -1.08, .4]}><boxGeometry args={[.025, .28, .02]} /><meshBasicMaterial color={CONTROL} toneMapped={false} /></mesh>
    <mesh position={[1.05, 1.42, .4]}><boxGeometry args={[.025, .32, .02]} /><meshBasicMaterial color={CONTROL} toneMapped={false} /></mesh>
    <mesh position={[2.35, -.18, .4]}><boxGeometry args={[.025, .32, .02]} /><meshBasicMaterial color={CONTROL} toneMapped={false} /></mesh>

    <group position={[3.35, .35, .2]}>
      <Block position={[0, 0, .18]} size={[.36, .75, .3]} color="#1d3541" />
      <mesh position={[-.2, 0, .2]}><cylinderGeometry args={[.06, .06, .34, 14]} /><meshStandardMaterial color={GOLD} metalness={.9} roughness={.24} /></mesh>
    </group>

    <mesh ref={token} visible={false}><sphereGeometry args={[.075, 14, 8]} /><meshBasicMaterial ref={tokenMaterial} color={DATA} transparent depthWrite={false} /></mesh>

    <Probe position={[-3.22, 1.78, .8]} title="PC.Q · pc_value" value={pc?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[-3.22, .5, .8]} title="imm" value={imm?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[-3.22, -.85, .8]} title="alu_result" value={alu?.value ?? '—'} color={WRITE} progress={progress} labelHost={labelHost} />
    <Probe position={[-1.45, 1.78, .8]} title="PC+4" value={pc4?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[-1.45, .5, .8]} title="PC+imm" value={relative?.active ? relative.value : '未选'} color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[-1.45, -.85, .8]} title="JALR align" value={jalr?.active ? jalr.value : '未选'} color={WRITE} progress={progress} labelHost={labelHost} />
    <Probe position={[-.1, -1.12, .8]} title="target MUX · jalr" value="" color={CONTROL} progress={progress} labelHost={labelHost} />
    <Probe position={[1.05, 1.8, .8]} title="normal MUX · redirect" value="" color={CONTROL} progress={progress} labelHost={labelHost} />
    <Probe position={[2.35, 1.55, .8]} title="hold MUX · trap | fault" value="" color={CONTROL} progress={progress} labelHost={labelHost} />
    <Probe position={[3.0, 1.8, .8]} title="next_pc → PC.D" value={next?.value ?? '—'} color={DATA} progress={progress} labelHost={labelHost} />
    <Probe position={[1.75, -1.55, .8]} title="组合逻辑 · 非寄存器" value="PC 在 clk↑ 捕获 D" color={CONTROL} progress={progress} labelHost={labelHost} />
  </group>
}

function InstructionMemoryHardware({ model, progress, labelHost, program }: Omit<HardwareProps, 'id'>) {
  const addressText = node(model, 'address')?.value ?? '—'
  const address = parseHex(addressText)
  const index = address !== undefined && address % 4 === 0 ? address >>> 2 : -1
  const traceWord = parseHex(node(model, 'word')?.value)
  const romWord = program && index >= 0 && index < program.length ? program[index] : undefined
  const currentWord = traceWord ?? romWord ?? 0
  const hasWord = traceWord !== undefined || romWord !== undefined
  let currentFormat: InstrFormat = 'I', currentAsm = hasWord ? '无法译码' : '等待 Take Trace'
  if (hasWord) {
    try {
      const instruction = decode(currentWord)
      currentFormat = instructionFormat(instruction.op)
      currentAsm = assembly(instruction)
    } catch { currentAsm = '非法 / 非 RV32I 指令' }
  }
  const [formatView, setFormatView] = useState<InstrFormat>(currentFormat)
  useEffect(() => { setFormatView(currentFormat) }, [currentWord, currentFormat])
  const fields = instructionFields(formatView, currentWord)
  const last = useRef(''), flow = useRef(1)
  const token = useRef<Mesh>(null), tokenMaterial = useRef<MeshBasicMaterial>(null)
  const panel = useRef<HTMLDivElement>(null)

  const wordAt = (i: number) => program && i >= 0 && i < program.length ? program[i] : undefined
  const rows = [-2, -1, 0, 1, 2].map(offset => {
    const i = index + offset
    const word = wordAt(i)
    return { i, word, current: i === index }
  })
  const rowY = (offset: number) => -offset * .7 - .4

  useFrame((_, dt) => {
    const signature = `${addressText}|${traceWord ?? ''}|${index}`
    if (last.current && signature !== last.current) flow.current = 0
    last.current = signature
    flow.current = Math.min(1, flow.current + dt / .7)
    const path = [[-3.25, 1.55], [-2.55, 1.55], [-2.55, -.4], [-1.85, -.4], [.45, 1.45], [3.35, 1.45]]
    const travel = smoothstep(0, 1, flow.current) * (path.length - 1)
    const i = Math.min(path.length - 2, Math.floor(travel)), f = travel - i, to = path[i + 1]
    if (token.current) {
      token.current.visible = flow.current > .002 && flow.current < .998
      token.current.position.set(path[i][0] + (to[0] - path[i][0]) * f, path[i][1] + (to[1] - path[i][1]) * f, .7)
    }
    if (tokenMaterial.current) tokenMaterial.current.opacity = Math.sin(flow.current * Math.PI) * .85
    if (panel.current) {
      const reveal = smoothstep(.3, .85, progress.position)
      panel.current.style.opacity = String(reveal)
      panel.current.style.transform = `scale(${(.55 + .45 * reveal).toFixed(3)})`
      panel.current.style.visibility = reveal < .01 ? 'hidden' : 'visible'
    }
  })

  return <group>
    <Strip width={7.6} depth={.08} y={-2.35} color="#273c47" />
    <mesh position={[-1.9, .25, .06]}><boxGeometry args={[3.9, 4.2, .06]} /><meshStandardMaterial color="#0b1920" metalness={.45} roughness={.5} /><Edges color="#29434f" threshold={20} /></mesh>
    <mesh position={[1.95, .25, .06]}><boxGeometry args={[3.7, 4.2, .06]} /><meshStandardMaterial color="#0a171d" metalness={.4} roughness={.55} /><Edges color="#253a44" threshold={20} /></mesh>

    {/* PC byte address -> word index -> nearby ROM window. */}
    <group position={[-3.38, 1.55, .2]}>
      <Block position={[0, 0, .18]} size={[.36, .62, .3]} color="#1d3541" />
      <mesh position={[.2, 0, .2]}><cylinderGeometry args={[.06, .06, .3, 14]} /><meshStandardMaterial color={GOLD} metalness={.9} roughness={.24} /></mesh>
    </group>
    <group position={[-2.55, 1.55, .2]}>
      <Block position={[0, 0, .18]} size={[.5, .5, .3]} color="#233b46" emissive={DATA} />
      <mesh position={[0, 0, .4]}><boxGeometry args={[.3, .025, .02]} /><meshBasicMaterial color={DATA} toneMapped={false} /></mesh>
    </group>
    <Bus x1={-3.2} x2={-2.8} y={1.55} color={DATA} />
    <mesh position={[-3.0, -.35, .4]}><boxGeometry args={[.025, 3.8, .02]} /><meshBasicMaterial color={DATA} toneMapped={false} /></mesh>

    {/* Nearby ROM words: five rows, current word stays at the optical center. */}
    {rows.map((row, rowIndex) => <group key={rowIndex} position={[-1.8, rowY(rowIndex - 2), .2]}>
      <Block position={[0, 0, .16]} size={[2.25, .48, .24]} color={row.current ? '#17343f' : '#11222a'} emissive={row.current ? DATA : undefined} />
      <mesh position={[-.98, 0, .4]}><boxGeometry args={[.06, .22, .04]} /><meshBasicMaterial color={row.current ? DATA : '#4a6674'} toneMapped={false} /></mesh>
      <Probe position={[.08, 0, .48]} title={`#${row.i >= 0 ? row.i : '—'}`} value={row.word !== undefined ? hex(row.word) : '—'} color={row.current ? DATA : '#8096a2'} progress={progress} labelHost={labelHost} />
    </group>)}
    <Probe position={[-2.9, 2.02, .8]} title="PC.Q · imem_addr → word" value={`${addressText} → #${index >= 0 ? index : '—'}`} color={DATA} progress={progress} labelHost={labelHost} />


    {/* 32-bit instruction strip. */}
    <group position={[1.95, 1.35, .2]}>
      <Block position={[0, 0, .1]} size={[3.25, .5, .16]} color="#0d222b" />
      {Array.from({ length: 32 }, (_, bit) => {
        const x = -1.56 + (31 - bit) * .1
        const active = ((currentWord >>> bit) & 1) === 1
        return <Cell key={bit} position={[x, 0, .26]} active={active} color={bitColor(fields, bit)} size={[.072, .2, .06]} />
      })}
      <mesh position={[0, -.34, .4]}><boxGeometry args={[3.0, .025, .02]} /><meshBasicMaterial color={DATA} toneMapped={false} /></mesh>
    </group>
    <Probe position={[1.95, 1.72, .8]} title="imem_rdata [31:0]" value={hasWord ? `${hex(currentWord)}` : '—'} color={WRITE} progress={progress} labelHost={labelHost} />

    <Html portal={{ current: labelHost }} center position={[2.2, -.15, .82]} zIndexRange={[9, 0]} style={{ pointerEvents: 'none' }}>
      <div ref={panel} className="instruction-breakdown" style={{ opacity: 0, transformOrigin: 'center' }}>
        <div className="ib-head"><b>当前 {currentFormat} · 查看 {formatView} · 无 IR</b><span>{hasWord ? hex(currentWord) : '—'}</span></div>
        <div className="ib-asm">{currentAsm}</div>
        <div className="ib-down">imem_rdata → Decoder / RF / Imm</div>
        {fields.map(field => <div key={field.key} className="ib-row">
          <i style={{ background: field.color }} /><span>{field.label}</span><em>{field.range}</em><code>{field.value}</code>
        </div>)}
      </div>
    </Html>

    {/* Format selectors are real 3D buttons; selecting one only changes the teaching view. */}
    {(['R', 'I', 'S', 'B', 'U', 'J'] as InstrFormat[]).map((format, i) => <group key={format} position={[-2.6 + i * .87, -2.25, .2]}
      onClick={event => { event.stopPropagation(); setFormatView(format) }}>
      <Block position={[0, 0, .14]} size={[.56, .27, .2]} color={formatView === format ? '#1d4655' : '#1a2c35'} emissive={formatView === format ? CONTROL : undefined} />
      <Probe position={[0, 0, .44]} title={format} value="" color={formatView === format ? CONTROL : '#8195a1'} progress={progress} labelHost={labelHost} />
    </group>)}
    <Probe position={[-3.25, -2.25, .8]} title="格式" value="" color={CONTROL} progress={progress} labelHost={labelHost} />

    <mesh ref={token} visible={false}><sphereGeometry args={[.07, 14, 8]} /><meshBasicMaterial ref={tokenMaterial} color={DATA} transparent depthWrite={false} /></mesh>
  </group>
}

function SimpleHardware({ model, progress, labelHost }: Omit<HardwareProps, 'id'>) {
  return <group>
    <Strip width={7.4} depth={.08} y={-2.2} color="#273c47" />
    <Block position={[0, .2, .2]} size={[3.4, 2.3, .35]} color="#142a34" emissive={DATA} />
    {model.nodes.slice(0, 4).map((item, i) => <Cell key={item.id} position={[-1.35 + i * .9, .85, .45]} active={item.active} color={CONTROL} size={[.6, .35, .16]} />)}
    <Probe position={[0, 1.75, .8]} title="module logic" value="RTL-derived" color={DATA} progress={progress} labelHost={labelHost} />
  </group>
}

export function ModuleHardware({ id, model, progress, labelHost, program }: HardwareProps) {
  switch (id) {
    case 'pc': return <PcHardware model={model} progress={progress} labelHost={labelHost} />
    case 'regfile': return <RegisterFileHardware model={model} progress={progress} labelHost={labelHost} />
    case 'alu': return <AluHardware model={model} progress={progress} labelHost={labelHost} />
    case 'decoder': return <DecoderHardware model={model} progress={progress} labelHost={labelHost} />
    case 'imm': return <ImmediateHardware model={model} progress={progress} labelHost={labelHost} />
    case 'mux': return <MuxHardware model={model} progress={progress} labelHost={labelHost} />
    case 'branch': return <BranchHardware model={model} progress={progress} labelHost={labelHost} />
    case 'dmem': return <MemoryHardware model={model} progress={progress} labelHost={labelHost} />
    case 'wb': return <WritebackHardware model={model} progress={progress} labelHost={labelHost} />
    case 'nextpc': return <NextPcHardware model={model} progress={progress} labelHost={labelHost} />
    case 'imem': return <InstructionMemoryHardware model={model} progress={progress} labelHost={labelHost} program={program} />
    default: return <SimpleHardware model={model} progress={progress} labelHost={labelHost} />
  }
}
