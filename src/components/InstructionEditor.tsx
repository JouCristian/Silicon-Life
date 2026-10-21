import { useState } from 'react'
import { assembly, binary, decode, encode, hex, type Instruction } from '../core/isa'
import { useLabView } from '../stores/useLabStore'

function RegisterSelect({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <label>{label}<select value={value} onChange={event => onChange(Number(event.target.value))}>
    {Array.from({ length: 32 }, (_, i) => <option key={i} value={i}>x{i}</option>)}
  </select></label>
}

export function InstructionEditor({ index }: { index: number }) {
  const { program, updateInstruction } = useLabView()
  const [draft, setDraft] = useState<Instruction>(() => decode(program[index]))
  const [immText, setImmText] = useState(() => draft.op === 'ADDI' ? String(draft.imm) : '0')
  const [saved, setSaved] = useState(false)
  const instruction: Instruction = 'imm' in draft ? { ...draft, imm: immText.trim() === '' ? NaN : Number(immText) } : draft
  let error = '', word = 0
  try { word = encode(instruction) } catch (e) { error = (e as Error).message }
  const change = (next: Instruction) => { setSaved(false); setDraft(next) }
  return <section className="editor">
    <div className="section-title"><h3>指令编码器</h3><span>第 {index + 1} 条</span></div>
    <div className="editor-fields">
      <label>指令<select value={draft.op} onChange={e => {
        const op = e.target.value as Instruction['op']
        const rd = 'rd' in draft ? draft.rd : 3, rs1 = draft.rs1
        change(op === 'ADD' ? { op, rd, rs1, rs2: 2 } : op === 'BEQ' || op === 'SW' ? { op, rs1, rs2: 2, imm: 0 } : { op, rd, rs1, imm: 0 })
      }}>{['ADDI', 'ADD', 'LW', 'SW', 'BEQ'].map(op => <option key={op}>{op}</option>)}</select></label>
      {'rd' in draft && <RegisterSelect label="rd" value={draft.rd} onChange={rd => change({ ...draft, rd })} />}
      <RegisterSelect label="rs1" value={draft.rs1} onChange={rs1 => change({ ...draft, rs1 })} />
      {'rs2' in draft && <RegisterSelect label="rs2" value={draft.rs2} onChange={rs2 => change({ ...draft, rs2 })} />}
      {'imm' in draft && <label>{draft.op === 'BEQ' ? '分支偏移 / 字节' : '立即数'}<input aria-label="立即数" type="number" min={draft.op === 'BEQ' ? -4096 : -2048} max={draft.op === 'BEQ' ? 4094 : 2047} step={draft.op === 'BEQ' ? 2 : 1} value={immText} onChange={e => { setSaved(false); setImmText(e.target.value) }} /></label>}
    </div>
    <div className="encoding"><code>{error ? '无效编码' : hex(word)}</code><span>{draft.op === 'ADD' ? 'R' : draft.op === 'SW' ? 'S' : draft.op === 'BEQ' ? 'B' : 'I'}-type</span></div>
    <code className="binary-code" aria-label="32 位机器码">{error ? '请修正指令参数' : binary(word).match(/.{4}/g)?.join(' ')}</code>
    {error && <p role="alert" className="error">{error}</p>}
    <button className="button subtle full" disabled={!!error} onClick={() => { updateInstruction(index, instruction); setSaved(true) }}>应用到程序并复位</button>
    <p className="field-help" role="status">{saved ? `已应用 ${assembly(instruction)}` : '应用后清空执行记录，寄存器恢复为 0。'}</p>
  </section>
}
