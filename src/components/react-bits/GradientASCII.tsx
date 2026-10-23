// React Bits GradientASCII adaptation; copyright (c) 2026 David Haz.
// MIT + Commons Clause: third_party/react-bits/LICENSE.md.
import { useEffect, useRef, type CSSProperties } from 'react'
import { useMotionPreference } from '../../motion/useMotionPreference'
import { mountGradient, type GradientSettings, type GradientShape } from './gradientRenderer'
import './GradientASCII.css'

export interface GradientASCIIProps {
  colors?: string[]
  shape?: GradientShape
  characters?: string
  cellSize?: number
  density?: number
  glyphOpacity?: number
  gradientOpacity?: number
  depthOfField?: number
  flicker?: number
  softness?: number
  scale?: number
  flow?: number
  speed?: number
  grain?: number
  variation?: number
  intro?: boolean
  fontFamily?: string
  dpr?: number
  className?: string
  style?: CSSProperties
}

const DEFAULTS: GradientSettings = {
  // A cool, product-site palette rather than the demo's full-saturation blue.
  // The two darkest steps keep the hero copy readable on the near-black page.
  colors: ['#1a304c', '#5a86a8', '#b4d8ef', '#d7efff'],
  shape: 'horizon',
  characters: ' .:-=+xX0S8#',
  cellSize: 30,
  density: .3,
  glyphOpacity: .5,
  gradientOpacity: .32,
  depthOfField: .08,
  flicker: .09,
  softness: .72,
  scale: 1.02,
  flow: .32,
  speed: .25,
  grain: .04,
  variation: 0,
  intro: true,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
}

export default function GradientASCII({
  colors = DEFAULTS.colors,
  shape = DEFAULTS.shape,
  characters = DEFAULTS.characters,
  cellSize = DEFAULTS.cellSize,
  density = DEFAULTS.density,
  glyphOpacity = DEFAULTS.glyphOpacity,
  gradientOpacity = DEFAULTS.gradientOpacity,
  depthOfField = DEFAULTS.depthOfField,
  flicker = DEFAULTS.flicker,
  softness = DEFAULTS.softness,
  scale = DEFAULTS.scale,
  flow = DEFAULTS.flow,
  speed = DEFAULTS.speed,
  grain = DEFAULTS.grain,
  variation = DEFAULTS.variation,
  intro = DEFAULTS.intro,
  fontFamily = DEFAULTS.fontFamily,
  dpr,
  className = '',
  style,
}: GradientASCIIProps) {
  const host = useRef<HTMLDivElement>(null)
  const reduced = useMotionPreference()
  const settings: GradientSettings = {
    colors, shape, characters, cellSize, density, glyphOpacity, gradientOpacity,
    depthOfField, flicker, softness, scale, flow, speed, grain, variation, intro, fontFamily, dpr,
  }
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  useEffect(() => {
    if (!host.current || reduced) return
    return mountGradient(host.current, settingsRef.current)
  }, [reduced])
  return <div
    ref={host}
    className={`gradient-ascii-container${className ? ` ${className}` : ''}`}
    style={style}
    aria-hidden="true"
    data-state="fallback"
  />
}
