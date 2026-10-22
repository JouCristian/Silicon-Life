import { useState } from 'react'
import { hex, i32 } from '../core/isa'
import { ABI } from '../data/programs'
import { useLabView } from '../stores/useLabStore'
import { parseValue } from '../io/memoryImage'

export function RegisterPanel() {
  const { cpu, trace, setInitialRegister, playing, running } = useLabView()
  const [radix, setRadix] = useState<'signed' | 'hex'>('signed')
  const [editing, setEditing] = useState(1)
  const [value, setValue] = useState('0')
  const [error, setError] = useState('')
  return <section className="register-panel">
    <div className="section-title"><h2>寄存器</h2><div className="segmented small" aria-label="寄存器进制"><button aria-pressed={radix === 'signed'} onClick={() => setRadix('signed')}>DEC</button><button aria-pressed={radix === 'hex'} onClick={() => setRadix('hex')}>HEX</button></div></div>
    <div className="register-grid">
      {cpu.registers.map((v, i) => <div key={i} className={`register ${trace?.write.committed && trace.write.rd === i ? 'changed' : ''}`} data-testid={`register-${i}`}>
        <span>x{i}<small>{ABI[i]}</small></span><code>{radix === 'hex' ? hex(v).slice(2) : i32(v)}</code>
      </div>)}
    </div>
    <details className="register-edit"><summary>设置初始寄存器</summary><div className="editor-fields">
      <label>寄存器<select value={editing} onChange={e => setEditing(Number(e.target.value))}>{ABI.slice(1).map((_, i) => <option key={i + 1} value={i + 1}>x{i + 1}</option>)}</select></label>
      <label>32 位值<input aria-label="寄存器初始值" value={value} onChange={e => setValue(e.target.value)} placeholder="十进制或 0x…" /></label>
    </div><button className="button subtle full" disabled={cpu.retired !== 0 || playing || running} onClick={() => {
      try { setInitialRegister(editing, parseValue(value, 32)); setError('') } catch (e) { setError((e as Error).message) }
    }}>写入初始值</button><p className="field-help">执行后需先复位；复位与装载程序均保留此配置；x0 恒为 0。</p>{error && <p role="alert" className="error">{error}</p>}</details>
    <p className="panel-footnote">架构状态 · 每条指令仅提交一次</p>
  </section>
}
