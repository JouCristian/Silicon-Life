import { useEffect, useRef } from 'react'
import { DISPLAY_BASE, DISPLAY_BYTES, DISPLAY_HEIGHT, DISPLAY_WIDTH } from '../core/devices/logisimDisplay'
import { hex } from '../core/isa'
import { useLabView } from '../stores/useLabStore'
import { usePeripheralStore } from '../stores/usePeripheralStore'
import { paintDisplayFrame } from './displayPaint'

export function DisplayPanel() {
  const { cpu, trace, inspection } = useLabView()
  const installed = usePeripheralStore(state => state.installed.includes('display'))
  const focus = usePeripheralStore(state => state.focus)
  const remove = usePeripheralStore(state => state.remove)
  const display = inspection && trace ? trace.after.display : cpu.display
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (canvas.current) paintDisplayFrame(canvas.current, display)
  }, [display])
  if (!installed) return null
  const last = display.lastWrite
  return <section className="display-panel" aria-label="MMIO 显示设备">
    <div className="section-title display-heading"><h2>MMIO 显示设备</h2><span>256 × 256 · RGB888</span></div>
    <div className="display-actions">
      <button className="text-button" onClick={() => focus('display')}>聚焦显示器</button>
      <button className="text-button danger-text" onClick={() => remove('display')}>移除</button>
    </div>
    <button className="display-surface" onClick={() => focus('display')} aria-label="放大 MMIO 显示器">
      <canvas ref={canvas} width={DISPLAY_WIDTH} height={DISPLAY_HEIGHT} role="img" aria-label="Logisim 显示器真实像素输出" data-testid="mmio-display" data-writes={display.writes} />
    </button>
    <p className="field-help">{hex(DISPLAY_BASE)}–{hex(DISPLAY_BASE + DISPLAY_BYTES - 1)} · 独立设备，支持 SW 写像素；无额外刷新寄存器。</p>
    <p className="field-help" data-testid="display-status">{inspection && trace ? `快照 #${trace.id}` : '运行设备'} · 已写 {display.writes.toLocaleString()} 次{last ? ` · (${last.x}, ${last.y}) #${last.rgb.toString(16).padStart(6, '0')}` : ' · 等待程序输出'}</p>
    <p className="field-help">大图请用「快速运行」，预算不足可继续；暂停保留像素，CPU 复位清屏。仅保存项目初始配置，不保存运行画面。</p>
  </section>
}
