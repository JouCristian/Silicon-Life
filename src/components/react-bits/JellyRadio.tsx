// Adapted from the supplied React Bits JellyRadio. Copyright (c) 2026 David Haz.
// MIT + Commons Clause: see third_party/react-bits/LICENSE.md and docs/THIRD_PARTY.md.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useMotionPreference } from '../../motion/useMotionPreference'
import './JellyRadio.css'

interface Item<T extends string> { value: T; label: string }
const spring = (stiffness: number, mass: number, bounce: number) => ({
  type: 'spring' as const, stiffness, damping: 2 * Math.sqrt(stiffness * mass) * (1 - bounce), mass,
})

function Chip({ on, index, selected, push, reduced, label, onClick, onKeyDown, elementRef }: {
  on: boolean; index: number; selected: number; push: number; reduced: boolean; label: string
  onClick: () => void; onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  elementRef: (element: HTMLButtonElement | null) => void
}) {
  const x = useMotionValue(0), sx = useMotionValue(1), sy = useMotionValue(1)
  const transform = useTransform(() => `translateX(${x.get()}px) scale(${sx.get()}, ${sy.get()})`)
  const first = useRef(true)
  useEffect(() => {
    const targetX = reduced ? 0 : Math.sign(index - selected) * push
    const targetScale = reduced ? 1 : on ? 1.035 : .99
    if (reduced || first.current) {
      x.jump(targetX); sx.jump(targetScale); sy.jump(targetScale); first.current = false; return
    }
    const far = Math.abs(index - selected), k = 540 * (1 - .12 * Math.min(far, 3))
    const delay = x.isAnimating() || sx.isAnimating() ? 0 : far * .012
    const animations = [animate(x, targetX, { ...spring(k, .9, .08), delay }),
      animate(sx, targetScale, { ...spring(k * 1.1, .86, .14), delay }),
      animate(sy, targetScale, { ...spring(k * .94, .92, .08), delay: delay + .018 })]
    return () => animations.forEach(animation => animation.stop())
  }, [on, index, selected, push, reduced, x, sx, sy])
  return <motion.button ref={elementRef} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
    className="jelly-radio__chip" data-on={on} style={{ transform }} onClick={onClick} onKeyDown={onKeyDown}>
    <span className="jelly-radio__skin"><span className="jelly-radio__label">{label}</span></span>
  </motion.button>
}

export function JellyRadio<T extends string>({ items, value, onChange, ariaLabel }: {
  items: readonly Item<T>[]; value: T; onChange: (value: T) => void; ariaLabel: string
}) {
  const selected = Math.max(0, items.findIndex(item => item.value === value))
  const group = useRef<HTMLDivElement>(null), buttons = useRef<(HTMLButtonElement | null)[]>([])
  const [push, setPush] = useState(3)
  const reduced = useMotionPreference()
  useLayoutEffect(() => {
    const measure = () => setPush((buttons.current[selected]?.offsetWidth ?? 72) * .035 / 2 + 1)
    measure()
    const observer = new ResizeObserver(measure)
    if (group.current) observer.observe(group.current)
    return () => observer.disconnect()
  }, [selected, items])
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = group.current && getComputedStyle(group.current).direction === 'rtl'
    let next: number
    switch (event.key) {
      case 'ArrowRight': next = index + (rtl ? -1 : 1); break
      case 'ArrowLeft': next = index + (rtl ? 1 : -1); break
      case 'ArrowDown': next = index + 1; break
      case 'ArrowUp': next = index - 1; break
      case 'Home': next = 0; break
      case 'End': next = items.length - 1; break
      default: return // Native button Enter/Space activation retains browser semantics.
    }
    event.preventDefault(); next = (next + items.length) % items.length
    onChange(items[next].value); buttons.current[next]?.focus()
  }
  return <div className="jelly-radio" ref={group} role="radiogroup" aria-label={ariaLabel}>
    {items.map((item, i) => <Chip key={item.value} index={i} selected={selected} push={push} reduced={reduced}
      on={i === selected} label={item.label} elementRef={element => { buttons.current[i] = element }}
      onClick={() => onChange(item.value)} onKeyDown={event => keyDown(event, i)} />)}
  </div>
}
