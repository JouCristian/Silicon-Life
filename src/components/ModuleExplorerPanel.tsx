import { useEffect, useMemo, useRef } from 'react'
import { hex } from '../core/isa'
import { EXPLORERS, type ExplorerId } from '../scenes/exploration/model'
import { useExplorationStore } from '../stores/useExplorationStore'
import { useLabView } from '../stores/useLabStore'
import './ModuleExplorerPanel.css'

export function ModuleExplorerPanel() {
  const { selected, enter, exit } = useExplorationStore()
  const { cpu, trace, history } = useLabView()
  const definition = selected ? EXPLORERS[selected] : undefined
  const model = useMemo(() => definition?.build(cpu, trace), [definition, cpu, trace])
  const stale = trace && trace.after !== cpu
  useEffect(() => {
    if (!selected) return
    const onKey = (event: KeyboardEvent) => { if (!event.defaultPrevented && event.key === 'Escape') { event.preventDefault(); exit() } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, exit])
  return <section className="module-explorer" aria-label="CPU 元件内部探索" data-testid="module-explorer">
    <div className="section-title"><h2>{definition ? `${definition.title} 内部` : '元件内部探索'}</h2>{selected && <button className="text-button" onClick={exit}>返回主板 · Esc</button>}</div>
    <div className="explorer-tabs">{(Object.keys(EXPLORERS) as ExplorerId[]).map(id => <button className="button subtle" key={id} aria-pressed={selected === id} onClick={() => enter(id)}>{EXPLORERS[id].title}</button>)}</div>
    {!definition ? <p className="field-help">点击主板 PC、Register File 或 ALU 进入，也可使用上方按钮。进入时暂停执行，可继续单步；Esc 返回主板。</p> : <>
      <p className="field-help">{definition.source} · {trace ? `${stale ? '历史观察' : '执行快照'} #${trace.id} · PC ${hex(trace.before.pc)}` : '当前架构状态，执行后显示信号'}{trace && cpu.status === 'fault' && history.at(-1)?.after !== cpu ? ' · 当前已故障，以下为最后有效 Trace，非故障指令信号' : ''}</p>
      <p className="field-help">{model?.note}</p>
      {selected === 'regfile' && <p className="field-help">三维格内使用 8 位十六进制，省略 0x 前缀；完整数值也可在下方展开读取。</p>}
      <dl className="explorer-values">{model?.nodes.filter(node => selected !== 'regfile' || !/^x\d+$/.test(node.id)).map(node => <div key={node.id} data-active={!!node.active}><dt>{node.title}</dt><dd>{node.value || '未选择'}</dd></div>)}</dl>
      {selected === 'regfile' && trace && <p className="field-help">写后值：{trace.write.committed ? `x${trace.write.rd}=${hex(trace.after.registers[trace.write.rd])}` : '本条无有效寄存器写入'}。32 个寄存器在三维内部展开，当前提交后的完整值仍可在下方寄存器面板读取。</p>}
      {selected === 'regfile' && <details><summary>32 个寄存器 · {trace ? '提交前快照' : '当前值'}</summary><dl className="explorer-values">{model?.nodes.filter(node => /^x\d+$/.test(node.id)).map(node => <div key={node.id}><dt>{node.title}</dt><dd>{node.value}</dd></div>)}</dl></details>}
    </>}
  </section>
}

export function ExplorerBackButton() {
  const { selected, exit } = useExplorationStore()
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (selected) button.current?.focus({ preventScroll: true }) }, [selected])
  return selected ? <button ref={button} className="text-button" onClick={exit} data-testid="exit-exploration">← 返回主板 · Esc</button> : null
}
