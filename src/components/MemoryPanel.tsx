import { useState } from 'react'
import { hex, i32 } from '../core/isa'
import { readWord } from '../core/memory'
import { useLabView } from '../stores/useLabStore'

export function MemoryPanel() {
  const { cpu, trace } = useLabView()
  const [start, setStart] = useState(64)
  return <section className="memory-panel">
    <div className="section-title"><h2>数据内存</h2><span>{cpu.memory.length} B · 小端</span></div>
    <label className="memory-address">起始字节地址<input aria-label="内存起始地址" type="number" min={0} max={cpu.memory.length - 16} step={4} value={start} onChange={e => {
      const n = Number(e.target.value)
      if (Number.isInteger(n) && n >= 0 && n <= cpu.memory.length - 16 && n % 4 === 0) setStart(n)
    }} /></label>
    {Array.from({ length: 4 }, (_, i) => {
      const address = start + i * 4
      return <div className={`memory-row ${trace?.memoryAccess?.address === address ? 'changed' : ''}`} key={address} data-testid={`memory-${address}`}>
        <span>{hex(address)}</span><code>{i32(readWord(cpu.memory, address))}</code>
        <small>{cpu.memory.slice(address, address + 4).map(n => n.toString(16).padStart(2, '0')).join(' ')}</small>
      </div>
    })}
    <p className="field-help">字节从低地址到高地址排列。面板显示已提交状态。</p>
  </section>
}
