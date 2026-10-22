import { useState } from 'react'
import { hex } from '../core/isa'
import { PROGRAMS } from '../data/programs'
import { MAX_PROGRAM_WORDS, programListing } from '../io/program'
import { useLabView } from '../stores/useLabStore'
import { InstructionEditor } from './InstructionEditor'
import { HexImportPanel } from './HexImportPanel'

export function ProgramPanel() {
  const { cpu, trace, history, program, programId, selectedInstruction: selected, selectInstruction,
    loadProgram, createCustomProgram, restoreCustomProgram, insertInstruction, deleteInstruction, moveInstruction } = useLabView()
  const [error, setError] = useState('')
  const preset = PROGRAMS.find(p => p.id === programId)
  const listing = programListing(program)
  const act = (action: () => void) => { try { action(); setError('') } catch (e) { setError((e as Error).message) } }
  return <>
    <div className="section-title"><h2>程序</h2><span>{program.length} / {MAX_PROGRAM_WORDS} 条</span></div>
    <select aria-label="教学程序" value={programId} onChange={e => act(() => loadProgram(e.target.value))}>
      {PROGRAMS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}<option value="custom">自定义程序</option>
    </select>
    <p className="program-name"><span>{preset?.summary ?? '本地自定义 · 起始地址 0x00000000'}</span></p>
    <div className="program-actions">
      <button className="button subtle" onClick={() => act(() => insertInstruction(program.length))} disabled={program.length >= MAX_PROGRAM_WORDS}>新增指令</button>
      {programId !== 'custom' && <button className="button subtle" onClick={() => act(() => createCustomProgram(program))}>复制为自定义</button>}
    </div>
    <details className="program-tools"><summary>程序管理</summary><div className="program-actions">
      <button className="button subtle" onClick={() => act(() => createCustomProgram())}>新建空白程序</button>
      <button className="button subtle" disabled={programId !== 'custom'} onClick={() => act(restoreCustomProgram)}>恢复自定义初始程序</button>
    </div><p className="field-help">编辑预设会生成自定义副本。当前会话保留一个自定义程序；新建或复制会替换它。</p></details>
    <HexImportPanel target="ROM" />
    <ol className="program-list">{listing.map(row => <li key={row.index} className={`${cpu.pc === row.address ? 'next-instruction' : ''} ${trace?.before.pc === row.address ? 'last-instruction' : ''}`}>
      <button onClick={() => selectInstruction(row.index)} aria-pressed={selected === row.index}>
        <span className="line-number">{String(row.index + 1).padStart(2, '0')}</span>
        <span><code>{row.assembly}</code><small>{hex(row.address)}<span>{hex(row.word)}</span></small>
          {row.target !== undefined && <small className={row.targetValid ? 'branch-target' : 'error'}>分支目标 → {hex(row.target)}{row.targetValid ? '' : '（范围外或未对齐）'}</small>}</span>
        <span className="line-state">{history.some(t => t.before.pc === row.address) ? '✓' : cpu.pc === row.address ? '←' : ''}</span>
      </button></li>)}</ol>
    {selected >= 0 ? <>
      <div className="instruction-actions" aria-label="选中指令操作">
        <button title="上移指令" aria-label="上移指令" disabled={selected === 0} onClick={() => act(() => moveInstruction(selected, selected - 1))}>↑</button>
        <button title="下移指令" aria-label="下移指令" disabled={selected === program.length - 1} onClick={() => act(() => moveInstruction(selected, selected + 1))}>↓</button>
        <button disabled={program.length >= MAX_PROGRAM_WORDS} onClick={() => act(() => insertInstruction(selected))}>在前插入</button>
        <button onClick={() => act(() => deleteInstruction(selected))}>删除指令</button>
      </div>
      <InstructionEditor key={`${programId}-${selected}-${program[selected]}`} index={selected} />
    </> : <p className="field-help empty-program">程序为空。点击「新增指令」或导入 HEX 开始。</p>}
    {listing.some(row => row.target !== undefined) && <p className="field-help">插入、删除或移动不会自动修改 BEQ 偏移，请检查分支目标。</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="sample-goal"><span>{preset ? '预设目标' : '程序说明'}</span><p>{preset?.goal ?? '修改程序会复位执行，保留已配置的初始 RAM 与寄存器。'}</p></div>
  </>
}
