import { useEffect, useState } from 'react'
import { assembly, binary, decode, encode, hex, type Instruction } from '../core/isa'
import { useLabView } from '../stores/useLabStore'
import { GlideSelect } from './GlideSelect'

function RegisterSelect({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <label>{label}<GlideSelect
    ariaLabel={label}
    value={String(value)}
    onChange={next => onChange(Number(next))}
    options={Array.from({ length: 32 }, (_, i) => ({ value: String(i), label: `x${i}` }))}
    size="sm"
    menuWidth={120}
  /></label>
}
function EditableInstruction({ index, initial }: { index: number; initial: Instruction }) {
  const { updateInstruction } = useLabView()
  const [draft, setDraft] = useState(initial), [immText, setImmText] = useState('imm' in initial ? String(initial.imm) : '0')
  const [saved, setSaved] = useState(false), [applyError, setApplyError] = useState('')
  const instruction: Instruction = 'imm' in draft ? { ...draft, imm: immText.trim() === '' ? NaN : Number(immText) } : draft
  let error = '', word = 0
  try { word = encode(instruction) } catch (e) { error = (e as Error).message }
  const change = (next: Instruction) => { setSaved(false); setDraft(next) }
  return <section className="editor">
    <div className="section-title"><h3>指令编码器</h3><span>第 {index + 1} 条</span></div>
    <div className="editor-fields"><label>指令<GlideSelect
      ariaLabel="指令"
      value={draft.op}
      onChange={value => {
        const op = value as Instruction['op'], rd = 'rd' in draft ? draft.rd : 3, rs1 = draft.rs1
        change(op === 'ADD' ? { op, rd, rs1, rs2: 2 } : op === 'BEQ' || op === 'SW' ? { op, rs1, rs2: 2, imm: 0 } : { op, rd, rs1, imm: 0 })
        setImmText('0')
      }}
      options={['ADDI', 'ADD', 'LW', 'SW', 'BEQ'].map(op => ({ value: op, label: op }))}
      size="sm"
      menuWidth={120}
    /></label>
      {'rd' in draft && <RegisterSelect label="rd" value={draft.rd} onChange={rd => change({ ...draft, rd })} />}
      <RegisterSelect label="rs1" value={draft.rs1} onChange={rs1 => change({ ...draft, rs1 })} />
      {'rs2' in draft && <RegisterSelect label="rs2" value={draft.rs2} onChange={rs2 => change({ ...draft, rs2 })} />}
      {'imm' in draft && <label>{draft.op === 'BEQ' ? '分支偏移 / 字节' : '立即数'}<input aria-label="立即数" type="number" min={draft.op === 'BEQ' ? -4096 : -2048} max={draft.op === 'BEQ' ? 4094 : 2047} step={draft.op === 'BEQ' ? 2 : 1} value={immText} onChange={e => { setSaved(false); setImmText(e.target.value) }} /></label>}
    </div><div className="encoding"><code>{error ? '无效编码' : hex(word)}</code><span>{draft.op === 'ADD' ? 'R' : draft.op === 'SW' ? 'S' : draft.op === 'BEQ' ? 'B' : 'I'}-type</span></div>
    <code className="binary-code" aria-label="32 位机器码">{error ? '请修正指令参数' : binary(word).match(/.{4}/g)?.join(' ')}</code>
    {(error || applyError) && <p role="alert" className="error">{error || applyError}</p>}
    <button className="button subtle full" disabled={!!error} onClick={() => { try { updateInstruction(index, instruction); setSaved(true); setApplyError('') } catch (e) { setApplyError((e as Error).message) } }}>应用到程序并复位</button>
    {saved && <p className="field-help" role="status">已应用 {assembly(instruction)}</p>}
  </section>
}
export function InstructionEditor({ index }: { index: number }) {
  const { program, updateInstruction } = useLabView()
  const [replace, setReplace] = useState(false)
  useEffect(() => setReplace(false), [index, program])
  let initial: Instruction
  try { initial = decode(program[index]) }
  catch { return <section className="editor"><p className="error">{hex(program[index])}：当前 CPU 不支持该指令。保留原始机器码，执行到这里会停止。</p><button className="button subtle" onClick={() => setReplace(true)}>改为受支持指令</button>{replace && <button className="button subtle" onClick={() => updateInstruction(index, { op: 'ADDI', rd: 0, rs1: 0, imm: 0 })}>确认替换为 ADDI x0, x0, 0</button>}</section> }
  return <EditableInstruction initial={initial} index={index} />
}
