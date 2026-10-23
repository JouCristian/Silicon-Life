import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './GlideSelect.css'

export interface GlideSelectOption {
  value: string
  label: ReactNode
  group?: string
  tag?: string
}

export interface GlideSelectProps {
  options: (string | GlideSelectOption)[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  id?: string
  disabled?: boolean
  size?: 'sm' | 'md'
  menuWidth?: number
  align?: 'left' | 'right'
  placement?: 'auto' | 'top' | 'bottom'
  className?: string
}

interface ResolvedOption extends GlideSelectOption { index: number }
interface Group { group?: string; items: ResolvedOption[] }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const textOf = (option: ResolvedOption) => typeof option.label === 'string' ? option.label : option.value

const themeVars = {
  '--gs-accent': '#9fc7ff',
  '--gs-surface': '#0d141d',
  '--gs-highlight': '#192636',
  '--gs-text': '#e6edf6',
  '--gs-muted': '#7f8c9f',
  '--gs-border': '#293747',
} as CSSProperties

/**
 * Glide Select with two deliberate integrations for the lab:
 * - the menu is portalled and internally scrollable so panel overflow cannot clip it;
 * - a transparent native <select> stays in the DOM as the labelled, form-safe
 *   control for keyboard/screen-reader use and for Playwright selectOption().
 */
export function GlideSelect({
  options,
  value,
  onChange,
  ariaLabel,
  id,
  disabled = false,
  size = 'md',
  menuWidth = 224,
  align = 'left',
  placement = 'auto',
  className = '',
}: GlideSelectProps) {
  const resolved = useMemo<ResolvedOption[]>(() => options.map((option, index) =>
    typeof option === 'string' ? { value: option, label: option, index } : { ...option, index }), [options])
  const groups = useMemo<Group[]>(() => {
    const result: Group[] = []
    resolved.forEach(option => {
      const last = result[result.length - 1]
      if (last && last.group === option.group) last.items.push(option)
      else result.push({ group: option.group, items: [option] })
    })
    return result
  }, [resolved])
  const selectedIndex = resolved.findIndex(option => option.value === value)
  const selected = selectedIndex >= 0 ? resolved[selectedIndex] : undefined
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<number | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0, width: menuWidth, side: 'bottom' as 'top' | 'bottom' })
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const nativeRef = useRef<HTMLSelectElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)
  const idSeed = useId()
  const listId = `${idSeed}-list`

  const close = () => setOpen(false)

  const openMenu = () => {
    if (disabled || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const estimate = Math.min(300, resolved.length * 29 + groups.length * 20 + 10)
    let side: 'top' | 'bottom' = placement === 'top' ? 'top' : 'bottom'
    if (placement === 'auto') {
      const below = window.innerHeight - rect.bottom
      const above = rect.top
      side = below < estimate + 12 && above > below ? 'top' : 'bottom'
    }
    const width = Math.min(menuWidth, window.innerWidth - 16)
    const left = clamp(align === 'right' ? rect.right - width : rect.left, 8, window.innerWidth - width - 8)
    const top = side === 'bottom' ? rect.bottom + 6 : rect.top - estimate - 6
    setPosition({ left, top, width, side })
    setActive(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }

  const choose = (index: number) => {
    const option = resolved[index]
    if (!option) { close(); return }
    if (option.value !== value) onChange(option.value)
    close()
    nativeRef.current?.focus({ preventScroll: true })
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const height = menuRef.current.offsetHeight
    const top = position.side === 'bottom' ? rect.bottom + 6 : rect.top - height - 6
    const nextTop = clamp(top, 8, Math.max(8, window.innerHeight - height - 8))
    if (nextTop !== position.top) setPosition(current => ({ ...current, top: nextTop }))
  }, [open, position.side, position.top, resolved.length])

  useLayoutEffect(() => {
    if (!open) return
    const list = listRef.current, pill = pillRef.current
    if (!list || !pill) return
    if (active === null) { pill.style.opacity = '0'; return }
    const option = list.querySelector<HTMLElement>(`[data-index="${active}"]`)
    if (!option) { pill.style.opacity = '0'; return }
    pill.style.transform = `translateY(${option.offsetTop}px)`
    pill.style.opacity = '1'
    const top = option.offsetTop, bottom = top + option.offsetHeight
    if (top < list.scrollTop) list.scrollTop = top
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }, [open, active, resolved.length])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      close()
    }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    const onScroll = (event: Event) => {
      if (menuRef.current?.contains(event.target as Node)) return
      close()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open])

  return <div
    ref={rootRef}
    className={`glide-select${size === 'sm' ? ' glide-select--sm' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`}
    style={themeVars}
  >
    <select
      ref={nativeRef}
      id={id}
      className="glide-select__native"
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={event => { onChange(event.target.value); close() }}
    >
      {groups.map((group, groupIndex) => group.group
        ? <optgroup key={`group-${groupIndex}-${group.group}`} label={group.group}>
            {group.items.map(option => <option key={option.value} value={option.value}>{textOf(option)}</option>)}
          </optgroup>
        : group.items.map(option => <option key={option.value} value={option.value}>{textOf(option)}</option>))}
    </select>
    <button
      ref={triggerRef}
      type="button"
      className="glide-select__trigger"
      aria-hidden="true"
      tabIndex={-1}
      disabled={disabled}
      aria-expanded={open}
      onClick={() => open ? close() : openMenu()}
    >
      <span className="glide-select__label" data-empty={selected ? undefined : ''}>{selected ? selected.label : '选择…'}</span>
      <span className="glide-select__chevron" aria-hidden="true">
        <svg viewBox="0 0 12 12" width="11" height="11" fill="none" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    </button>
    {open && createPortal(
      <div
        ref={menuRef}
        className="glide-select__menu"
        data-side={position.side}
        data-align={align}
        style={{ ...themeVars, left: position.left, top: position.top, width: position.width }}
        role="listbox"
        aria-label={ariaLabel}
        id={listId}
      >
        <div ref={listRef} className="glide-select__list">
          <span ref={pillRef} className="glide-select__pill" aria-hidden="true" />
          {groups.map((group, groupIndex) => <div className="glide-select__group" key={`items-${groupIndex}-${group.group ?? 'none'}`}>
            {group.group && <div className="glide-select__group-label">{group.group}</div>}
            {group.items.map(option => <div
              key={option.value}
              className="glide-select__option"
              role="option"
              aria-selected={option.value === value}
              data-index={option.index}
              onPointerEnter={event => { if (event.pointerType !== 'touch') setActive(option.index) }}
              onPointerDown={event => event.preventDefault()}
              onClick={() => choose(option.index)}
            >
              <span className="glide-select__name">{option.label}</span>
              {option.tag && <span className="glide-select__tag">{option.tag}</span>}
              <span className="glide-select__check" data-on={option.value === value ? '' : undefined} aria-hidden="true">
                <svg viewBox="0 0 12 12" width="10" height="10" fill="none">
                  <path d="m2.2 6.2 2.4 2.4 5.2-5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>)}
          </div>)}
        </div>
      </div>,
      document.body,
    )}
  </div>
}
