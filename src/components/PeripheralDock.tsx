import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import { DISPLAY_BASE, DISPLAY_HEIGHT, DISPLAY_WIDTH } from '../core/devices/logisimDisplay'
import { hex } from '../core/isa'
import { useLabView } from '../stores/useLabStore'
import { usePeripheralStore } from '../stores/usePeripheralStore'
import { paintDisplayFrame } from './displayPaint'
import './PeripheralDock.css'

function DisplayPreview() {
  const { cpu, trace, inspection } = useLabView()
  const installed = usePeripheralStore(state => state.installed.includes('display'))
  const display = inspection && trace ? trace.after.display : cpu.display
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => { if (canvas.current) paintDisplayFrame(canvas.current, display) }, [display])
  return <div className={`peripheral-preview ${installed ? 'is-live' : ''}`}>
    <canvas ref={canvas} width={DISPLAY_WIDTH} height={DISPLAY_HEIGHT} aria-label="MMIO Display 实时帧缓冲预览" />
    <span className="peripheral-preview-scan" />
    <span className="peripheral-preview-state"><i />{installed ? 'LIVE · MMIO' : 'STANDBY · 未连接'}</span>
  </div>
}

function MonitorGlyph() {
  return <svg viewBox="0 0 40 40" aria-hidden="true"><rect x="5" y="5" width="30" height="23" rx="1.5" /><path d="M14 34h12M20 28v6" /><path d="M9 9h10M9 13h6" opacity=".45" /></svg>
}

export function PeripheralDock() {
  const installed = usePeripheralStore(state => state.installed.includes('display'))
  const focused = usePeripheralStore(state => state.focused === 'display')
  const install = usePeripheralStore(state => state.install)
  const remove = usePeripheralStore(state => state.remove)
  const focus = usePeripheralStore(state => state.focus)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])
  useEffect(() => {
    if (!focused) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') focus(null) }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [focused, focus])

  const connect = () => {
    install('display')
    setOpen(false)
  }
  const disconnect = () => {
    remove('display')
    setOpen(false)
  }

  return <>
    <div className="peripheral-dock">
      {focused && <button className="peripheral-return" onClick={() => focus(null)}><span aria-hidden="true">←</span> 返回主板</button>}
      <button className={`peripheral-trigger ${installed ? 'is-connected' : ''}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        <span className="peripheral-trigger-led" />
        <span>{installed ? '外设 01' : '添加外设'}</span>
        <span className="peripheral-trigger-count">{installed ? 'DISPLAY' : '+'}</span>
      </button>
    </div>
    {createPortal(<AnimatePresence>{open && <motion.div className="peripheral-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .22 }} onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
      <motion.section className="peripheral-dialog" role="dialog" aria-modal="true" aria-labelledby="peripheral-title" initial={{ opacity: 0, y: 18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .98 }} transition={{ duration: .34, ease: [.22, 1, .36, 1] }}>
        <header className="peripheral-dialog-head"><div><span className="eyebrow">WORKBENCH / DEVICES</span><h2 id="peripheral-title">外设扩展</h2></div><button className="peripheral-close" onClick={() => setOpen(false)} aria-label="关闭外设面板">×</button></header>
        <p className="peripheral-lead">把独立设备接入 CPU 的真实 MMIO 总线。设备像素只来自已提交的 CPU 状态，不生成演示画面。</p>
        <div className="peripheral-list">
          <article className={`peripheral-card ${installed ? 'is-installed' : ''}`}>
            <div className="peripheral-card-visual"><DisplayPreview /><span className="peripheral-slot">SLOT 01</span></div>
            <div className="peripheral-card-body">
              <div className="peripheral-card-title"><span className="peripheral-icon"><MonitorGlyph /></span><div><h3>MMIO Display</h3><p>256 × 256 · RGB888</p></div><span className={`peripheral-state ${installed ? 'online' : ''}`}>{installed ? '已连接' : '未连接'}</span></div>
              <dl className="peripheral-specs"><div><dt>地址</dt><dd>{hex(DISPLAY_BASE)}</dd></div><div><dt>设备</dt><dd>SW → RGB</dd></div><div><dt>总线</dt><dd>DATA / MMIO</dd></div></dl>
              <p className="peripheral-description">真实帧缓冲显示。接入后可在 3D 工作台查看，点击屏幕进入放大器视角。</p>
              <div className="peripheral-card-actions">
                {installed ? <><button className="button subtle" onClick={() => { focus('display'); setOpen(false) }}>聚焦显示器</button><button className="text-button danger-text" onClick={disconnect}>断开并移除</button></> : <button className="button primary" onClick={connect}>连接到总线 <span aria-hidden="true">↗</span></button>}
              </div>
            </div>
          </article>
          <article className="peripheral-card is-reserved" aria-disabled="true">
            <div className="peripheral-reserved-icon"><span>+</span></div>
            <div><h3>串口 / UART</h3><p>下一个外设槽位</p></div>
            <span className="peripheral-state">预留</span>
          </article>
        </div>
        <footer className="peripheral-dialog-foot"><span><i className="peripheral-foot-led" />设备状态与工作台连接状态同步</span><span>MMIO BUS · 32 bit</span></footer>
      </motion.section>
    </motion.div>}</AnimatePresence>, document.body)}
  </>
}
