import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  EquirectangularReflectionMapping,
  PMREMGenerator,
  SRGBColorSpace,
} from 'three'

/**
 * A tiny, deterministic product-photography environment. It replaces the
 * flat matcap used by the integrated V2 asset while keeping the same renderer
 * and material count: one generated equirect texture is convolved once by the
 * renderer's PMREM generator, then sampled by the physical materials.
 *
 * The layout is deliberately asymmetrical: a large neutral softbox from the
 * upper left gives the titanium its long highlight, a cool strip on the right
 * supplies the restrained blue edge, and the surrounding black keeps the
 * contrast high without adding a visible background.
 */
function createStudioTexture(): CanvasTexture {
  const width = 1536
  const height = 768
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建摄影棚环境纹理')

  const base = ctx.createLinearGradient(0, 0, 0, height)
  base.addColorStop(0, '#111a22')
  base.addColorStop(0.36, '#070c12')
  base.addColorStop(1, '#010304')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, width, height)

  const glow = (x: number, y: number, rx: number, ry: number, color: string, strength: number) => {
    ctx.save()
    ctx.translate(x * width, y * height)
    ctx.scale(rx * width, ry * height)
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
    gradient.addColorStop(0, color.replace('ALPHA', String(strength)))
    gradient.addColorStop(0.4, color.replace('ALPHA', String(strength * 0.72)))
    gradient.addColorStop(1, color.replace('ALPHA', '0'))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(0, 0, 1, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Broad key softbox. Its reflection becomes the long silver band across the
  // top rails instead of a generic white rim around every bevel.
  glow(0.27, 0.23, 0.25, 0.12, 'rgba(255, 253, 246, ALPHA)', 0.98)
  glow(0.31, 0.17, 0.07, 0.045, 'rgba(255, 255, 255, ALPHA)', 0.94)

  // Narrow overhead strip: crisp specular punctuation on screws and chamfers.
  glow(0.56, 0.16, 0.055, 0.26, 'rgba(238, 247, 255, ALPHA)', 0.62)

  // Cool studio fill from the right. Kept low and desaturated to avoid the
  // electric-blue look that made the earlier frame feel like a game HUD.
  glow(0.82, 0.65, 0.28, 0.22, 'rgba(70, 126, 176, ALPHA)', 0.54)
  glow(0.78, 0.53, 0.08, 0.055, 'rgba(150, 202, 240, ALPHA)', 0.28)

  // Dim warm bounce below/left so black ceramic does not lose its edge.
  glow(0.12, 0.63, 0.23, 0.16, 'rgba(151, 124, 94, ALPHA)', 0.2)
  glow(0.44, 0.82, 0.34, 0.1, 'rgba(65, 77, 90, ALPHA)', 0.25)

  const texture = new CanvasTexture(canvas)
  texture.name = 'ChipV3StudioEnvironment'
  texture.mapping = EquirectangularReflectionMapping
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

export function StudioEnvironment({ enabled = true }: { enabled?: boolean }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    const previousEnvironment = scene.environment
    const previousIntensity = scene.environmentIntensity
    const previousToneMapping = gl.toneMapping
    const previousExposure = gl.toneMappingExposure

    gl.toneMapping = ACESFilmicToneMapping
    gl.toneMappingExposure = .94
    if (!enabled) {
      return () => {
        gl.toneMapping = previousToneMapping
        gl.toneMappingExposure = previousExposure
      }
    }

    const source = createStudioTexture()
    const pmrem = new PMREMGenerator(gl)
    pmrem.compileEquirectangularShader()
    const target = pmrem.fromEquirectangular(source)
    source.dispose()
    pmrem.dispose()

    scene.environment = target.texture
    scene.environmentIntensity = .94

    return () => {
      scene.environment = previousEnvironment
      scene.environmentIntensity = previousIntensity
      gl.toneMapping = previousToneMapping
      gl.toneMappingExposure = previousExposure
      target.dispose()
    }
  }, [gl, scene, enabled])

  return null
}
