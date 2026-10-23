import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

// Run alone (no simultaneous browser tests). Development metrics describe the
// previous completed CPU Canvas draw; frame intervals include CPU + GPU + OS.
const label = process.argv[2] ?? 'current'
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use a lowercase alphanumeric benchmark label')
const output = `.local/chip-v2/${label}`
await mkdir(output, { recursive: true })
const browser = await chromium.launch({ channel: 'chromium', args: process.env.CHIP_GPU_MODE === 'hardware' ? ['--use-gl=angle', '--use-angle=d3d11'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  await page.goto(process.env.CHIP_URL ?? 'http://127.0.0.1:5173/')
  const root = page.getByTestId('scene-root')
  await root.waitFor()
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="scene-root"]').dataset.renderTime) > 3)
  const sample = () => page.evaluate(() => new Promise(resolve => {
    const frames = [], start = performance.now(); let last = -1
    const read = () => {
      const d = document.querySelector('[data-testid="scene-root"]').dataset, time = Number(d.renderTime)
      if (time !== last) { frames.push({ time, calls: Number(d.drawCalls), triangles: Number(d.triangles), geometries: Number(d.geometries), textures: Number(d.textures) }); last = time }
      if (performance.now() - start < 5000) requestAnimationFrame(read)
      else resolve(frames)
    }
    requestAnimationFrame(read)
  }))
  const home = await sample()
  await page.screenshot({ path: `${output}/home.png` })
  await page.getByRole('button', { name: '进入芯片' }).click()
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="scene-root"]').dataset.reveal) > .9999)
  const workbench = await sample()
  await page.screenshot({ path: `${output}/workbench.png` })
  await page.getByRole('button', { name: '探索芯片', exact: true }).click()
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="scene-root"]').dataset.reveal) < .0001)
  const returned = await sample()
  await page.screenshot({ path: `${output}/return.png` })
  const gpu = await page.locator('.persistent-scene canvas').evaluate(canvas => {
    const gl = canvas.getContext('webgl2'), debug = gl.getExtension('WEBGL_debug_renderer_info')
    return { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), timerQueryAvailable: !!gl.getExtension('EXT_disjoint_timer_query_webgl2') }
  })
  const summarize = frames => {
    const ms = frames.slice(1).map((f, i) => (f.time - frames[i].time) * 1000).sort((a, b) => a - b)
    return { frames: frames.length, medianFrameMs: ms[Math.floor(ms.length / 2)], p95FrameMs: ms[Math.floor(ms.length * .95)], fps: (frames.length - 1) / (frames.at(-1).time - frames[0].time), ...frames.at(-1) }
  }
  const result = { label, viewport: [1440, 900], gpu, errors, summary: { home: summarize(home), workbench: summarize(workbench), returned: summarize(returned) }, samples: { home, workbench, returned } }
  await writeFile(`${output}/benchmark.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ ...result, samples: undefined }, null, 2))
  if (errors.length) process.exitCode = 1
} finally { await browser.close() }
