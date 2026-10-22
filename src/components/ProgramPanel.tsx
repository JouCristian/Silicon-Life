import { useEffect, useMemo, useState } from 'react'
import { decode, hex } from '../core/isa'
import { PROGRAMS } from '../data/programs'
import { MAX_PROGRAM_WORDS, programListing } from '../io/program'
import { parseValue } from '../io/memoryImage'
import { useLabView } from '../stores/useLabStore'
import { InstructionEditor } from './InstructionEditor'
import { HexImportPanel } from './HexImportPanel'
import { ProjectControls } from './ProjectControls'

export const PROGRAM_PAGE_SIZE = 16
export function ProgramPanel() {
  const { cpu, trace, history, program, programId, activeProjectId, projects, selectedInstruction: selected, selectInstruction,
    createProject, insertInstruction, deleteInstruction, moveInstruction, storageReady, projectNotice } = useLabView()
  const [error, setError] = useState(''), [page, setPage] = useState(0), [jump, setJump] = useState('0')
  const [unsupported, setUnsupported] = useState<number | undefined>(0)
  const preset = PROGRAMS.find(p => p.id === programId), readonly = !!preset
  const listing = useMemo(() => programListing(program, page * PROGRAM_PAGE_SIZE, (page + 1) * PROGRAM_PAGE_SIZE), [program, page])
  const recent = useMemo(() => new Set(history.map(t => t.before.pc)), [history])
  useEffect(() => { setPage(Math.max(0, Math.floor(selected / PROGRAM_PAGE_SIZE))) }, [selected, activeProjectId, program])
  useEffect(() => {
    let cancelled = false, index = 0, count = 0, timer: ReturnType<typeof setTimeout>
    setUnsupported(undefined)
    const scan = () => {
      if (cancelled) return
      const end = Math.min(index + 1024, program.length)
      for (; index < end; index++) { try { decode(program[index]) } catch { count++ } }
      if (index < program.length) timer = setTimeout(scan, 0)
      else setUnsupported(count)
    }
    timer = setTimeout(scan, 0)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [program])
  const act = (action: () => void) => { try { action(); setError('') } catch (e) { setError((e as Error).message) } }
  const pages = Math.max(1, Math.ceil(program.length / PROGRAM_PAGE_SIZE))
  return <>
    <ProjectControls />
    {projectNotice && <p className="field-help" role="status">{projectNotice}</p>}
    <div className="section-title rom-heading"><h2>指令 ROM</h2><span>{program.length.toLocaleString()} / {MAX_PROGRAM_WORDS.toLocaleString()} 条</span></div>
    <p className="field-help rom-capacity">{(program.length * 4 / 1024).toFixed(2)} KiB / 256 KiB · {projects.find(p => p.id === activeProjectId)?.name ?? preset?.name}</p>
    {!!unsupported && <p className="error" role="status">当前程序包含 {unsupported} 条暂不支持的机器指令，运行到该处会安全停止。</p>}
    <form className="pc-jump" onSubmit={e => { e.preventDefault(); act(() => {
      const address = parseValue(jump, 32)
      if (address % 4 || address / 4 >= program.length) throw new Error('请输入程序范围内、4 字节对齐的 PC 地址')
      selectInstruction(address / 4); setPage(Math.floor(address / 4 / PROGRAM_PAGE_SIZE))
    }) }}><label>跳转 PC<input aria-label="跳转 PC 地址" value={jump} onChange={e => setJump(e.target.value)} /></label><button className="button subtle" disabled={!program.length}>跳转</button>
      <button type="button" className="text-button" disabled={cpu.pc / 4 >= program.length} onClick={() => { selectInstruction(cpu.pc / 4); setPage(Math.floor(cpu.pc / 4 / PROGRAM_PAGE_SIZE)) }}>定位 PC</button></form>
    <div className="program-pagination"><button aria-label="上一页指令" disabled={page === 0} onClick={() => setPage(p => p - 1)}>←</button><span>{page + 1} / {pages} 页 · 每页 16 条</span><button aria-label="下一页指令" disabled={page + 1 >= pages} onClick={() => setPage(p => p + 1)}>→</button></div>
    <ol className="program-list" start={page * PROGRAM_PAGE_SIZE + 1}>{listing.map(row => <li key={row.index} className={`${cpu.pc === row.address ? 'next-instruction' : ''} ${trace?.before.pc === row.address ? 'last-instruction' : ''}`}>
      <button onClick={() => selectInstruction(row.index)} aria-pressed={selected === row.index}>
        <span className="line-number">{row.index + 1}</span><span><code>{row.assembly}</code><small>{hex(row.address)}<span>{hex(row.word)}</span></small>
          {row.target !== undefined && <small className={row.targetValid ? 'branch-target' : 'error'}>分支目标 → {hex(row.target)}{row.targetValid ? '' : '（范围外或未对齐）'}</small>}</span>
        <span className="line-state">{recent.has(row.address) ? '✓' : cpu.pc === row.address ? '←' : ''}</span>
      </button></li>)}</ol>
    <p className="field-help">✓ 最近执行 · 历史仅保留最近 128 条</p>
    <div className="program-actions"><button className="button subtle" onClick={() => act(() => insertInstruction(program.length))} disabled={!storageReady || readonly || program.length >= MAX_PROGRAM_WORDS}>新增指令</button><button className="button subtle" onClick={() => { const region = document.getElementById('rom-hex-import'); const details = region?.querySelector('details'); if (details) details.open = true; region?.scrollIntoView({ block: 'nearest' }) }}>导入 ROM</button></div>
    {readonly ? <div className="readonly-preset"><p className="field-help">内置示例只读。编辑前请复制为我的项目。</p><button className="button subtle full" disabled={!storageReady || projects.length >= 10} onClick={() => act(() => createProject(undefined, true))}>复制示例开始编辑</button></div> : selected >= 0 ? <>
      <div className="instruction-actions" aria-label="选中指令操作"><button aria-label="上移指令" disabled={selected === 0} onClick={() => act(() => moveInstruction(selected, selected - 1))}>↑</button><button aria-label="下移指令" disabled={selected === program.length - 1} onClick={() => act(() => moveInstruction(selected, selected + 1))}>↓</button><button disabled={program.length >= MAX_PROGRAM_WORDS} onClick={() => act(() => insertInstruction(selected))}>在前插入</button><button onClick={() => act(() => deleteInstruction(selected))}>删除指令</button></div>
      <InstructionEditor key={`${activeProjectId}-${selected}-${program[selected]}`} index={selected} />
    </> : <p className="field-help empty-program">程序为空。新增指令或导入 ROM 开始。</p>}
    <div id="rom-hex-import"><HexImportPanel key={activeProjectId} target="ROM" /></div>
    {error && <p className="error" role="alert">{error}</p>}
    {preset && <div className="sample-goal"><span>预设目标</span><p>{preset.goal}</p></div>}
  </>
}
