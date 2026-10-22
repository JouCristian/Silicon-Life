import { useState } from 'react'
import { hex, i32 } from '../core/isa'
import { createMemory, readWord } from '../core/memory'
import { editMemory, parseValue } from '../io/memoryImage'
import type { CellWidth } from '../io/hex'
import { useLabView } from '../stores/useLabStore'
import { HexImportPanel } from './HexImportPanel'

export function MemoryPanel() {
  const { cpu, initialMemory, setInitialMemory, playing, running } = useLabView()
  const [start, setStart] = useState(64)
  const [view, setView] = useState<'runtime' | 'initial'>('runtime')
  const [radix, setRadix] = useState('dec')
  const [viewWidth, setViewWidth] = useState<CellWidth>(32)
  const [width, setWidth] = useState<CellWidth>(32)
  const [address, setAddress] = useState('64')
  const [value, setValue] = useState('42')
  const [error, setError] = useState('')
  const memory = view === 'initial' ? initialMemory : cpu.memory
  const locked = cpu.retired !== 0 || playing || running
  const act = (action: () => void) => { try { action(); setError('') } catch (e) { setError((e as Error).message) } }
  return <section className="memory-panel">
    <div className="section-title"><h2>数据内存</h2><span>{cpu.memory.length} B · 小端</span></div>
    <div className="editor-fields">
      <label>数据视图<select aria-label="内存数据视图" value={view} onChange={e => setView(e.target.value as typeof view)}><option value="runtime">运行内存</option><option value="initial">初始内存</option></select></label>
      <label>显示进制<select aria-label="内存显示进制" value={radix} onChange={e => setRadix(e.target.value)}><option value="dec">DEC（有符号字）</option><option value="hex">HEX</option></select></label>
    </div>
    <label className="import-strategy">观察宽度<select aria-label="内存观察宽度" value={viewWidth} onChange={e => setViewWidth(Number(e.target.value) as CellWidth)}><option value={32}>32-bit 字</option><option value={8}>8-bit 字节（无符号）</option></select></label>
    <label className="memory-address">起始字节地址<input aria-label="内存起始地址" type="number" min={0} max={cpu.memory.length - 16} step={4} value={start} onChange={e => {
      const n = Number(e.target.value)
      if (Number.isInteger(n) && n >= 0 && n <= cpu.memory.length - 16 && n % 4 === 0) setStart(n)
    }} /></label>
    {Array.from({ length: 16 / (viewWidth / 8) }, (_, i) => {
      const address = start + i * viewWidth / 8
      const changed = cpu.memory.slice(address, address + viewWidth / 8).some((byte, lane) => byte !== initialMemory[address + lane])
      const value = viewWidth === 32 ? readWord(memory, address) : memory[address]
      return <div className={`memory-row ${changed ? 'changed' : ''}`} key={address} data-testid={`memory-${address}`}>
        <span>{hex(address)}{changed && <b title="运行值与初始值不同"> Δ</b>}</span><code>{radix === 'hex' ? `0x${value.toString(16).padStart(viewWidth / 4, '0')}` : viewWidth === 32 ? i32(value) : value}</code>
        <small>{memory.slice(address, address + viewWidth / 8).map((n, lane) => <span className={cpu.memory[address + lane] !== initialMemory[address + lane] ? 'changed-byte' : ''} key={lane}>{n.toString(16).padStart(2, '0')}{lane < viewWidth / 8 - 1 ? ' ' : ''}</span>)}</small>
      </div>
    })}
    <p className="field-help">字节从低地址到高地址排列。Δ 标记运行值与初始配置的差异；复位会恢复初始数据。</p>
    <details className="memory-edit"><summary>编辑初始 RAM</summary>
      <div className="editor-fields">
        <label>写入宽度<select aria-label="RAM 写入宽度" value={width} onChange={e => setWidth(Number(e.target.value) as CellWidth)}><option value={8}>8-bit 字节</option><option value={32}>32-bit 字</option></select></label>
        <label>CPU 字节地址<input aria-label="RAM 编辑地址" value={address} onChange={e => setAddress(e.target.value)} /></label>
      </div>
      <label className="file-field">数据（十进制 / 0x）<input aria-label="RAM 初始数据" value={value} onChange={e => setValue(e.target.value)} /></label>
      <div className="program-actions"><button className="button subtle" disabled={locked} onClick={() => act(() => setInitialMemory(editMemory(initialMemory, parseValue(address, 32), value, width)))}>写入初始 RAM</button>
        <button className="button subtle" disabled={locked} onClick={() => act(() => setInitialMemory(createMemory()))}>清空初始 RAM</button></div>
      <p className="field-help">{locked ? '执行后请先复位，再编辑初始数据。' : '32 位值支持 −2147483648…4294967295；8 位值为 0…255。32 位地址需 4 字节对齐。'}</p>
      {error && <p className="error" role="alert">{error}</p>}
    </details>
    <HexImportPanel target="RAM" />
  </section>
}
