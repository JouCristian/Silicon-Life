import { useEffect, useRef } from 'react'
import { DISPLAY_BASE, DISPLAY_BYTES, DISPLAY_HEIGHT, DISPLAY_WIDTH } from '../core/devices/logisimDisplay'
import { hex } from '../core/isa'
import { useLabView } from '../stores/useLabStore'

export function DisplayPanel() {
  const { cpu, trace, inspection } = useLabView()
  const display = inspection && trace ? trace.after.display : cpu.display
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = canvas.current?.getContext('2d')
    if (!context) return
    const frame = context.createImageData(DISPLAY_WIDTH, DISPLAY_HEIGHT)
    let offset = 0
    // Framebuffer is a separate device snapshot. UI only paints committed data.
    for (const byte of display.pixels) {
      const lane = offset % 4
      frame.data[offset - lane + (lane === 0 ? 2 : lane === 2 ? 0 : lane)] = lane === 3 ? 255 : byte
      offset++
    }
    context.putImageData(frame, 0, 0)
  }, [display])
  const last = display.lastWrite
  return <section className="display-panel" aria-label="MMIO 显示设备">
    <div className="section-title"><h2>MMIO 显示设备</h2><span>256 × 256 · RGB888</span></div>
    <canvas ref={canvas} width={DISPLAY_WIDTH} height={DISPLAY_HEIGHT} role="img" aria-label="Logisim 显示器真实像素输出" data-testid="mmio-display" data-writes={display.writes}
      style={{ width: '100%', maxWidth: 256, height: 'auto', imageRendering: 'pixelated', background: '#000', border: '1px solid var(--line)' }} />
    <p className="field-help">{hex(DISPLAY_BASE)}–{hex(DISPLAY_BASE + DISPLAY_BYTES - 1)} · 独立设备，支持 SW 写像素；无额外刷新寄存器。</p>
    <p className="field-help" data-testid="display-status">{inspection && trace ? `快照 #${trace.id}` : '运行设备'} · 已写 {display.writes.toLocaleString()} 次{last ? ` · (${last.x}, ${last.y}) #${last.rgb.toString(16).padStart(6, '0')}` : ' · 等待程序输出'}</p>
    <p className="field-help">大图请用「快速运行」，预算不足可继续；暂停保留像素，CPU 复位清屏。仅保存项目初始配置，不保存运行画面。</p>
  </section>
}
