import { useEffect, useMemo, useState } from 'react'
import { hex, i32 } from '../core/isa'
import { createMemory, readWord } from '../core/memory'
import { editMemory, parseValue } from '../io/memoryImage'
import type { CellWidth } from '../io/hex'
import { RAM_SIZES } from '../projects/model'
import { useLabView } from '../stores/useLabStore'
import { HexImportPanel } from './HexImportPanel'
import { GlideSelect } from './GlideSelect'

export function MemoryPanel() {
  const { cpu, initialMemory, setInitialMemory, resizeMemory, playing, running, fastRunning, programId, activeProjectId, history } = useLabView()
  const recentWrites = useMemo(() => [...new Set(history.flatMap(trace => trace.memoryAccess?.kind === 'store' && trace.memoryAccess.space === 'ram' ? [trace.memoryAccess.address] : []))].slice(-8), [history])
  const [start, setStart] = useState(64), [browse, setBrowse] = useState('64')
  const [view, setView] = useState<'runtime' | 'initial'>('runtime'), [radix, setRadix] = useState('dec')
  const [viewWidth, setViewWidth] = useState<CellWidth>(32), [width, setWidth] = useState<CellWidth>(32)
  const [address, setAddress] = useState('64'), [value, setValue] = useState('42'), [error, setError] = useState('')
  const memory = view === 'initial' ? initialMemory : cpu.memory
  const locked = cpu.retired !== 0 || playing || running || fastRunning, readonly = programId !== 'custom'
  useEffect(() => { setStart(64); setBrowse('64'); setError('') }, [activeProjectId])
  const act = (action: () => void) => { try { action(); setError('') } catch (e) { setError((e as Error).message) } }
  return <section className="memory-panel">
    <div className="section-title"><h2>数据内存</h2><span>{initialMemory.length / 1024} KiB · 小端</span></div>
    <label className="memory-mode-label">RAM 模式<GlideSelect
      ariaLabel="内存数据视图"
      value={view}
      onChange={value => setView(value as typeof view)}
      options={[{ value: 'initial', label: '初始 RAM · 配置' }, { value: 'runtime', label: '运行 RAM · 只读' }]}
      menuWidth={220}
    /></label>
    <p className="field-help">{view === 'initial' ? '编辑后保存到当前项目。复位后将恢复初始配置。' : 'CPU 实际提交结果，只读。Δ 标记与初始配置不同的地址。'}</p>
    {view === 'runtime' && recentWrites.length > 0 && <div className="recent-writes"><span>最近写入地址</span>{recentWrites.map(location => <button className="text-button" key={location} onClick={() => { const next = Math.min(location - location % 4, memory.length - 16); setStart(next); setBrowse(String(next)) }}>{hex(location)}</button>)}</div>}
    <div className="editor-fields"><label>观察宽度<GlideSelect
      ariaLabel="内存观察宽度"
      value={String(viewWidth)}
      onChange={value => setViewWidth(Number(value) as CellWidth)}
      options={[{ value: '32', label: '32-bit 字' }, { value: '8', label: '8-bit 字节' }]}
      menuWidth={180}
    /></label><label>显示进制<GlideSelect
      ariaLabel="内存显示进制"
      value={radix}
      onChange={value => setRadix(value)}
      options={[{ value: 'dec', label: 'DEC' }, { value: 'hex', label: 'HEX' }]}
      menuWidth={140}
    /></label></div>
    <form className="memory-jump" onSubmit={e => { e.preventDefault(); act(() => {
      const n = parseValue(browse, 32)
      if (n >= memory.length) throw new Error('地址超出当前 RAM 容量')
      const next = Math.min(Math.floor(n / 4) * 4, memory.length - 16); setStart(next); setBrowse(String(next))
    }) }}><label>CPU 字节地址<input aria-label="内存起始地址" value={browse} onChange={e => { setBrowse(e.target.value); const n = Number(e.target.value); if (Number.isInteger(n) && n >= 0 && n <= memory.length - 16 && n % 4 === 0) setStart(n) }} /></label><button className="button subtle">跳转内存</button></form>
    {Array.from({ length: 16 / (viewWidth / 8) }, (_, i) => {
      const location = Math.min(start, memory.length - 16) + i * viewWidth / 8
      const changed = cpu.memory.slice(location, location + viewWidth / 8).some((byte, lane) => byte !== initialMemory[location + lane])
      const data = viewWidth === 32 ? readWord(memory, location) : memory[location]
      return <div className={`memory-row ${view === 'runtime' && changed ? 'changed' : ''}`} key={location} data-testid={`memory-${location}`}><span>{hex(location)}{view === 'runtime' && changed && <b title="运行值与初始值不同"> Δ</b>}</span><code>{radix === 'hex' ? `0x${data.toString(16).padStart(viewWidth / 4, '0')}` : viewWidth === 32 ? i32(data) : data}</code><small>{memory.slice(location, location + viewWidth / 8).map((n, lane) => <span className={view === 'runtime' && cpu.memory[location + lane] !== initialMemory[location + lane] ? 'changed-byte' : ''} key={lane}>{n.toString(16).padStart(2, '0')}{lane < viewWidth / 8 - 1 ? ' ' : ''}</span>)}</small></div>
    })}
    {view === 'runtime' ? <p className="field-help">字节从低地址到高地址排列。切换「初始 RAM」编辑配置。</p> : readonly ? <p className="field-help">内置示例只读，请先复制为我的项目。</p> : <>
      <label className="import-strategy">RAM 容量<GlideSelect
        ariaLabel="RAM 容量"
        value={String(initialMemory.length)}
        disabled={locked}
        onChange={value => {
          const size = Number(value)
          if (size < initialMemory.length && !window.confirm('缩小 RAM 会丢弃超出容量的初始数据，是否继续？')) return
          act(() => resizeMemory(size))
        }}
        options={RAM_SIZES.map(size => ({ value: String(size), label: size === 1048576 ? '1 MiB' : `${size / 1024} KiB` }))}
        menuWidth={180}
      /></label>
      <div className="memory-edit"><h3>编辑初始 RAM</h3><div className="editor-fields"><label>写入宽度<GlideSelect
        ariaLabel="RAM 写入宽度"
        value={String(width)}
        onChange={value => setWidth(Number(value) as CellWidth)}
        options={[{ value: '8', label: '8-bit 字节' }, { value: '32', label: '32-bit 字' }]}
        menuWidth={180}
      /></label><label>CPU 字节地址<input aria-label="RAM 编辑地址" value={address} onChange={e => setAddress(e.target.value)} /></label></div><label className="file-field">数据（十进制 / 0x）<input aria-label="RAM 初始数据" value={value} onChange={e => setValue(e.target.value)} /></label>
        <div className="program-actions"><button className="button subtle" disabled={locked} onClick={() => act(() => setInitialMemory(editMemory(initialMemory, parseValue(address, 32), value, width)))}>写入初始 RAM</button><button className="button subtle" disabled={locked} onClick={() => { if (window.confirm('清空当前项目的全部初始 RAM？此操作不能撤销。')) act(() => setInitialMemory(createMemory(new Uint8Array(initialMemory.length)))) }}>清空初始 RAM</button></div>
        {locked && <p className="field-help">请先复位 CPU，再编辑初始数据。运行结果不会被悄悄覆盖。</p>}
        {error && <p className="error" role="alert">{error}</p>}
      </div><HexImportPanel key={activeProjectId} target="RAM" />
    </>}
    {error && (view === 'runtime' || readonly) && <p className="error" role="alert">{error}</p>}
  </section>
}
