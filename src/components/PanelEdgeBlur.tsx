import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import './PanelEdgeBlur.css'

interface Box { left: number; top: number; width: number; height: number }
interface Props { position?: 'top' | 'bottom'; height?: number; strength?: number; layers?: number }

/**
 * A panel-bound adaptation of React Bits' GradualBlur. The real overlay lives
 * in a fixed portal and tracks a .panel-scroll viewport, so it never scrolls
 * with the content, never clips the GlideSelect menu, and never eats a click.
 */
export function PanelEdgeBlur({ position = 'bottom', height = 34, strength = .8, layers = 3 }: Props) {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState<Box | null>(null)
  const [visible, setVisible] = useState(false)

  useLayoutEffect(() => {
    const anchor = anchorRef.current
    const scroller = anchor?.closest<HTMLElement>('.panel-scroll')
    if (!scroller) return undefined
    let lastKey = ''
    const update = () => {
      const rect = scroller.getBoundingClientRect()
      const width = Math.max(0, scroller.clientWidth)
      const top = position === 'bottom' ? rect.bottom - height : rect.top
      const next: Box = { left: Math.round(rect.left), top: Math.round(top), width: Math.ceil(width), height }
      const key = `${next.left}:${next.top}:${next.width}:${next.height}`
      if (key !== lastKey) { lastKey = key; setBox(next) }
      const atStart = scroller.scrollTop <= 1
      const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1
      setVisible(position === 'top' ? !atStart : !atEnd)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    if (scroller.firstElementChild) observer.observe(scroller.firstElementChild)
    scroller.addEventListener('scroll', update, { passive: true })
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', update)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [height, position])

  const stack = Array.from({ length: Math.max(1, layers) }, (_, index) => {
    const start = index / Math.max(1, layers) * 100
    const end = (index + 1) / Math.max(1, layers) * 100
    const direction = position === 'bottom' ? 'to bottom' : 'to top'
    const mask = `linear-gradient(${direction}, transparent ${start}%, #000 ${end}%)`
    const style: CSSProperties = {
      backdropFilter: `blur(${(index + 1) * strength}px)`,
      WebkitBackdropFilter: `blur(${(index + 1) * strength}px)`,
      maskImage: mask,
      WebkitMaskImage: mask,
    }
    return <span key={index} className="panel-edge-blur__layer" style={style} />
  })

  return <>
    <span ref={anchorRef} className="panel-edge-blur-anchor" aria-hidden="true" />
    {box && createPortal(<div
      className="panel-edge-blur"
      data-position={position}
      data-visible={visible ? 'true' : 'false'}
      style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
      aria-hidden="true"
    >{stack}</div>, document.body)}
  </>
}
