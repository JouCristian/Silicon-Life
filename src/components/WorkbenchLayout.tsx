import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

type Axis = 'left' | 'right' | 'vertical'
const DEFAULTS = { left: 254, right: 244, vertical: .57 }
const MIN = { left: 210, right: 210, center: 380, top: 318, bottom: 160 }

/** Native scrolling and pointer-captured separators; only layout state lives here. */
export function WorkbenchLayout({ open, program, scene, details, state }: {
  open: boolean; program: ReactNode; scene: ReactNode; details: ReactNode; state: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null), center = useRef<HTMLElement>(null)
  const [size, setSize] = useState(DEFAULTS)
  const [bounds, setBounds] = useState({ width: 1200, height: 600 })
  const dragging = useRef<{ axis: Axis; pointer: number; start: number; value: number } | null>(null)
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (root.current && center.current) setBounds({ width: root.current.clientWidth, height: center.current.clientHeight })
    })
    if (root.current) observer.observe(root.current)
    if (center.current) observer.observe(center.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => () => { document.body.classList.remove('resizing-panels') }, [])
  // Clamp against the current viewport every render, including after zoom/resize.
  const left = Math.max(MIN.left, Math.min(size.left, bounds.width - MIN.right - MIN.center - 16))
  const right = Math.max(MIN.right, Math.min(size.right, bounds.width - left - MIN.center - 16))
  const top = Math.max(MIN.top, Math.min(bounds.height * size.vertical, bounds.height - MIN.bottom - 8))
  const change = (axis: Axis, value: number) => setSize(old => ({ ...old, [axis]: axis === 'vertical'
    ? Math.max(MIN.top, Math.min(value, bounds.height - MIN.bottom - 8)) / Math.max(1, bounds.height)
    : Math.max(MIN[axis], Math.min(value, bounds.width - (axis === 'left' ? right : left) - MIN.center - 16)) }))
  const position = (e: PointerEvent, axis: Axis) => axis === 'vertical' ? e.clientY : e.clientX
  const down = (e: PointerEvent<HTMLDivElement>, axis: Axis) => {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    dragging.current = { axis, pointer: e.pointerId, start: position(e, axis), value: axis === 'left' ? left : axis === 'right' ? right : top }
    e.currentTarget.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing-panels')
  }
  const stop = () => { dragging.current = null; document.body.classList.remove('resizing-panels') }
  const key = (e: KeyboardEvent, axis: Axis) => {
    const direction = ['ArrowLeft', 'ArrowUp'].includes(e.key) ? -1 : ['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : 0
    if (e.key === 'Home') { e.preventDefault(); setSize(s => ({ ...s, [axis]: DEFAULTS[axis] })); return }
    if (!direction) return
    e.preventDefault()
    change(axis, (axis === 'left' ? left : axis === 'right' ? right : top) + direction * (axis === 'right' ? -1 : 1) * (e.shiftKey ? 40 : 12))
  }
  const separator = (axis: Axis, label: string, before: string, after: string) => <div className={`panel-separator ${axis === 'vertical' ? 'horizontal' : 'vertical'} ${axis}-separator`} role="separator" tabIndex={0}
    aria-label={label} aria-orientation={axis === 'vertical' ? 'horizontal' : 'vertical'} aria-controls={`${before} ${after}`}
    aria-valuemin={axis === 'vertical' ? MIN.top : MIN[axis]} aria-valuemax={Math.max(axis === 'vertical' ? MIN.top : MIN[axis], axis === 'vertical' ? bounds.height - MIN.bottom - 8 : bounds.width - (axis === 'left' ? right : left) - MIN.center - 16)}
    aria-valuenow={Math.round(axis === 'left' ? left : axis === 'right' ? right : top)} aria-valuetext={`${Math.round(axis === 'left' ? left : axis === 'right' ? right : top)} 像素`}
    title="拖动调整；方向键微调，Shift 加速，双击或 Home 恢复"
    onPointerDown={e => down(e, axis)} onPointerMove={e => {
      const drag = dragging.current
      if (!drag || drag.pointer !== e.pointerId) return
      change(drag.axis, drag.value + (position(e, axis) - drag.start) * (axis === 'right' ? -1 : 1))
    }} onPointerUp={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); stop() }} onPointerCancel={stop} onLostPointerCapture={stop}
    onKeyDown={e => key(e, axis)} onDoubleClick={() => setSize(s => ({ ...s, [axis]: DEFAULTS[axis] }))}><span /></div>
  return <div ref={root} className="lab-layout" style={{ '--left-panel': `${left}px`, '--right-panel': `${right}px`, '--scene-height': `clamp(318px, ${size.vertical * 100}%, calc(100% - 168px))` } as CSSProperties}>
    {program}
    {open && separator('left', '程序与 CPU 区域宽度', 'program-region', 'cpu-region')}
    <section ref={center} id="cpu-region" className="scene-column" aria-label="三维 CPU 工作区">
      <div id="viewport-region" className="scene-stage">{scene}</div>
      {open && separator('vertical', '三维与讲解区域高度', 'viewport-region', 'details-region')}
      {open && <div id="details-region" className="details-scroll panel-scroll" role="region" aria-label="CPU 控制与 Trace" tabIndex={0}>{details}</div>}
    </section>
    {open && separator('right', 'CPU 与状态区域宽度', 'cpu-region', 'state-region')}
    {state}
  </div>
}
