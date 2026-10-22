import { assembly, hex, i32 } from '../core/isa'
import { PHASES, PHASE_LABELS } from '../core/trace/types'
import { useLabView } from '../stores/useLabStore'
import { PLAYBACK_RATES, transferSteps } from '../motion/transferPlayback'

export function TracePanel() {
  const { trace, phase, observe, history, traceIndex, replay, resumePlayback, pause, playing, mode, stepTransfer, transferPlayback, playbackRate, setPlaybackRate, playbackEpoch } = useLabView()
  const steps = transferSteps(trace)
  const transfer = transferPlayback.mode === 'transfer' ? steps[transferPlayback.index] : undefined
  const descriptions = trace ? {
    fetch: `PC ${hex(trace.before.pc)} 向指令存储器寻址，读出 ${hex(trace.word)}。`,
    decode: `${trace.instruction.op}：读取 x${trace.instruction.rs1} = ${i32(trace.signals.rs1_data)}，${'imm' in trace.instruction ? `立即数符号扩展为 ${i32(trace.signals.imm)}` : `读取 x${trace.instruction.rs2} = ${i32(trace.signals.rs2_data)}`}。`,
    execute: trace.instruction.op === 'BEQ' ? `Branch Unit 比较 ${i32(trace.signals.rs1_data)} 与 ${i32(trace.signals.rs2_data)}，分支${trace.signals.redirect ? '成立' : '不成立'}；next_pc = ${hex(trace.signals.next_pc)}。` : `ALU 计算 ${i32(trace.signals.alu_a)} + ${i32(trace.signals.alu_b)} = ${i32(trace.signals.alu_result)}，结果保留低 32 位。`,
    memory: trace.memoryAccess ? `${trace.memoryAccess.kind === 'load' ? 'LW 读取' : 'SW 写入'}地址 ${hex(trace.memoryAccess.address)}，数据 ${hex(trace.memoryAccess.data)}，字节选通 ${trace.signals.dmem_wstrb.toString(2).padStart(4, '0')}。` : '本条指令不访问数据内存，mem_read = 0，mem_write = 0。',
    writeback: trace.write.committed ? `将 ${i32(trace.write.value)} 写入 x${trace.write.rd}，PC 更新为 ${hex(trace.after.pc)}。` : `${trace.signals.reg_write ? '目标为 x0，丢弃寄存器写入' : '本条指令不写寄存器'}；PC 更新为 ${hex(trace.after.pc)}。`,
  } : null
  return <section className="trace-panel">
    <div className="section-title"><h2>观察一条指令</h2><span>{trace ? assembly(trace.instruction) : '从单步开始'}</span></div>
    <div className="transfer-toolbar">
      <button className="button subtle" onClick={stepTransfer} disabled={!steps.length || transferPlayback.mode === 'transfer' && (playing || transferPlayback.complete)}>单步传递</button>
      <label className="playback-speed">传播速率<select aria-label="传播速率" value={playbackRate} onChange={e => setPlaybackRate(Number(e.target.value))}>{PLAYBACK_RATES.map(rate => <option key={rate} value={rate}>{rate.toFixed(2)}×</option>)}</select></label>
      <div className="transfer-status" role="status" data-testid="transfer-status" data-transfer-end={transfer?.end} data-playback-epoch={playbackEpoch}>{transferPlayback.mode === 'transfer' ? transferPlayback.complete ? `本条指令的 ${steps.length} 组可观察传递已完成。可回放或执行下一条指令。` : `${transferPlayback.index + 1} / ${steps.length} · ${transfer?.transfers.map(t => `${t.from} → ${t.to} (${t.signal})`).join('；')} · ${playing ? '传播中' : '已暂停，等待下一次操作'}` : '每次观察一组真实连接；并行信号保留同组关系，不代表 CPU 时钟。'}</div>
    </div>
    <div className="phases" aria-label="概念观察阶段">{PHASES.map((p, i) => {
      const detail = p === 'memory' ? trace?.memoryAccess ? trace.memoryAccess.kind === 'load' ? 'Load' : 'Store' : '可跳过' : ['Read', 'Decode', 'Compute', '', 'Commit'][i]
      return <button key={p} aria-label={`0${i + 1} ${PHASE_LABELS[p]} ${detail}`} disabled={!trace} className={phase === p && trace ? 'selected' : ''} aria-pressed={phase === p && !!trace} onClick={() => observe(p)}><span>0{i + 1}</span>{PHASE_LABELS[p]}<small>{detail}</small></button>
    })}</div>
    <p className="phase-description" aria-live="polite">{descriptions?.[phase] ?? '点击「单步指令」，观察数据如何穿过一颗单周期 CPU。'}</p>
    <div className="trace-note"><span className="tiny-dot" />慢动作仅解释已提交的快照，不增加时钟周期。</div>
    {mode === 'pro' && <div className="signals"><div className="section-title"><h3>RTL 信号快照</h3><span>ADDI / ADD / LW / SW / BEQ</span></div>{trace ? Object.entries(trace.signals).map(([key, value]) => <div key={key}><code>{key}</code><code>{key.endsWith('_data') || key.startsWith('dmem_') && key !== 'dmem_we' && key !== 'dmem_wstrb' || ['imm', 'alu_a', 'alu_b', 'alu_result', 'target', 'normal_next_pc', 'pc_value', 'pc_plus4', 'next_pc', 'imem_addr', 'imem_rdata'].includes(key) ? hex(value) : value}</code></div>) : <p className="field-help">执行后显示与 cpu_top.v 对应的信号。</p>}</div>}
    {history.length > 0 && <div className="history"><label htmlFor="trace-history">执行记录</label><select id="trace-history" value={traceIndex} onChange={e => replay(Number(e.target.value))}>{history.map((t, i) => <option value={i} key={t.id}>#{t.id} · {assembly(t.instruction)}</option>)}</select><button className="button subtle" onClick={() => replay(traceIndex)}>回放</button>{playing ? <button className="button subtle" onClick={pause}>暂停讲解</button> : <button className="button subtle" onClick={resumePlayback}>继续讲解</button>}</div>}
  </section>
}
