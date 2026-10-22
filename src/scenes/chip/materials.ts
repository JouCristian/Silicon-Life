import { DataTexture, LinearFilter, RGBAFormat, SRGBColorSpace } from 'three'

/** Small deterministic studio reflection, sampled once per fragment instead of
 * running a clearcoat + PMREM convolution on every hardware detail. Matcap
 * normals still track the rounded geometry and the user's orbiting camera. */
export function createMetalMatcap(): DataTexture {
  const size = 128, pixels = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const nx = (x + .5) / size * 2 - 1, ny = (y + .5) / size * 2 - 1
    const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    const softbox = Math.exp(-((nx + .38) ** 2 / .2 + (ny - .48) ** 2 / .08))
    const rim = (1 - z) ** 3
    const strip = Math.exp(-(((ny - .26 * nx - .18) / .055) ** 2))
    const shade = Math.min(1, .42 + .38 * softbox + .24 * rim + .22 * strip)
    const i = (y * size + x) * 4
    pixels[i] = shade * 245; pixels[i + 1] = shade * 250; pixels[i + 2] = shade * 255; pixels[i + 3] = 255
  }
  const texture = new DataTexture(pixels, size, size, RGBAFormat)
  texture.name = 'ChipV2StudioMatcap'
  texture.colorSpace = SRGBColorSpace
  texture.minFilter = LinearFilter; texture.magFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}
