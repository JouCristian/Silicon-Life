import { assembly, hex, i32 } from '../core/isa'
import { PHASES, PHASE_LABELS } from '../core/trace/types'
import { useLabView } from '../stores/useLabStore'

export function TracePanel() {
  const { trace, phase, observe, history, traceIndex, replay, mode } = useLabView()
  const descriptions = trace ? {
    fetch: `PC ${hex(trace.before.pc)} 向指令存储器寻址，读出 ${hex(trace.word)}。`,
    decode: `${trace.instruction.op}：读取 x${trace.instruction.rs1} = ${i32(trace.signals.rs1_data)}，${trace.instruction.op === 'ADDI' ? `立即数符号扩展为 ${i32(trace.signals.imm)}` : `读取 x${trace.instruction.op === 'ADD' ? trace.instruction.rs2 : 0} = ${i32(trace.signals.rs2_data)}`}。`,
    execute: `ALU 计算 ${i32(trace.signals.alu_a)} + ${i32(trace.signals.alu_b)} = ${i32(trace.signals.alu_result)}，结果保留低 32 位。`,
    memory: '本条算术指令不访问数据存储器，mem_read = 0，mem_write = 0。',
    writeback: trace.write.committed ? `将 ${i32(trace.write.value)} 写入 x${trace.write.rd}，PC 更新为 ${hex(trace.after.pc)}。` : `目标为 x0，丢弃寄存器写入；PC 更新为 ${hex(trace.after.pc)}。`,
  } : null
  return <section className="trace-panel">
    <div className="section-title"><h2>观察一条指令</h2><span>{trace ? assembly(trace.instruction) : '从单步开始'}</span></div>
    <div className="phases" aria-label="概念观察阶段">{PHASES.map((p, i) => <button key={p} disabled={!trace} className={phase === p && trace ? 'selected' : ''} aria-pressed={phase === p && !!trace} onClick={() => observe(p)}><span>0{i + 1}</span>{PHASE_LABELS[p]}<small>{p === 'memory' ? '可跳过' : ['Read', 'Decode', 'Compute', '', 'Commit'][i]}</small></button>)}</div>
    <p className="phase-description" aria-live="polite">{descriptions?.[phase] ?? '点击「单步指令」，观察数据如何穿过一颗单周期 CPU。'}</p>
    <div className="trace-note"><span className="tiny-dot" />慢动作仅解释已提交的快照，不增加时钟周期。</div>
    {mode === 'pro' && <div className="signals"><div className="section-title"><h3>RTL 信号快照</h3><span>ADDI / ADD 子集</span></div>{trace ? Object.entries(trace.signals).map(([key, value]) => <div key={key}><code>{key}</code><code>{key.endsWith('_data') || ['imm', 'alu_a', 'alu_b', 'alu_result', 'pc_value', 'pc_plus4', 'next_pc', 'imem_addr', 'imem_rdata'].includes(key) ? hex(value) : value}</code></div>) : <p className="field-help">执行后显示与 cpu_top.v 对应的信号。</p>}</div>}
    {history.length > 0 && <div className="history"><label htmlFor="trace-history">执行记录</label><select id="trace-history" value={traceIndex} onChange={e => replay(Number(e.target.value))}>{history.map((t, i) => <option value={i} key={t.id}>#{t.id} · {assembly(t.instruction)}</option>)}</select><button className="button subtle" onClick={() => replay(traceIndex)}>回放</button></div>}
  </section>
}
