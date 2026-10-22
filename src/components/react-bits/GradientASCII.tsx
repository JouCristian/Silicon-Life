// React Bits GradientASCII adaptation; copyright (c) 2026 David Haz.
// MIT + Commons Clause: third_party/react-bits/LICENSE.md.
import { useEffect, useRef } from 'react'
import { useMotionPreference } from '../../motion/useMotionPreference'
import { mountGradient } from './gradientRenderer'
import './GradientASCII.css'

export default function GradientASCII() {
  const host = useRef<HTMLDivElement>(null)
  const reduced = useMotionPreference()
  useEffect(() => {
    if (!host.current || reduced) return
    return mountGradient(host.current)
  }, [reduced])
  return <div className="gradient-ascii-container" ref={host} aria-hidden="true" data-state="fallback" />
}
