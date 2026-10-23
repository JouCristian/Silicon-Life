import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'

test('V2 asset keeps one CPU Canvas, home orbit/zoom, reversible poses and bounded resources', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const root = page.getByTestId('scene-root')
  await expect(root).toHaveAttribute('data-chip-ready', 'true')
  const canvas = await page.locator('.persistent-scene canvas').elementHandle()
  const initialPose = await root.getAttribute('data-chip-pose')
  const loads = await root.getAttribute('data-chip-loads')
  const disposed = await root.getAttribute('data-chip-disposals')
  expect(Number(loads) - Number(disposed)).toBe(1)
  const camera = () => root.getAttribute('data-camera')
  const initialCamera = await camera()
  const anchor = (await page.getByTestId('scene-anchor').boundingBox())!
  await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2)
  await page.mouse.down(); await page.mouse.move(anchor.x + anchor.width / 2 + 60, anchor.y + anchor.height / 2 + 20, { steps: 5 }); await page.mouse.up()
  await expect.poll(camera).not.toBe(initialCamera)
  const rotated = await camera()
  await page.mouse.wheel(0, 120)
  await expect.poll(camera).not.toBe(rotated)
  // Visit both scene states first so all teaching geometries have uploaded.
  await page.getByRole('button', { name: '进入芯片' }).click()
  await expect(root).toHaveAttribute('data-chip-visible', 'false')
  await page.getByRole('button', { name: '探索芯片', exact: true }).click()
  await expect(root).toHaveAttribute('data-reveal', '0.0000')
  await expect.poll(() => root.getAttribute('data-chip-pose')).toBe(initialPose)
  const resources = async () => root.evaluate(el => ({ geometry: el.dataset.geometries, textures: el.dataset.textures }))
  const before = await resources()
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'CPU 工作台', exact: true }).click()
    await expect(root).toHaveAttribute('data-chip-visible', 'false')
    // Asset raycasts and draw calls must be gone in the final teaching plane.
    await expect.poll(async () => Number(await root.getAttribute('data-draw-calls'))).toBe(61)
    await expect(page.locator('[data-module="alu"]')).toBeVisible()
    await page.getByRole('button', { name: '探索芯片', exact: true }).click()
    await expect.poll(() => root.getAttribute('data-chip-pose')).toBe(initialPose)
  }
  expect(await resources()).toEqual(before)
  expect(await root.getAttribute('data-chip-loads')).toBe(loads)
  expect(await root.getAttribute('data-chip-disposals')).toBe(disposed)
  expect(await page.locator('.persistent-scene canvas').evaluate((node, original) => node === original, canvas)).toBe(true)
  expect(errors).toEqual([])
})

test('assembled, inspected teardown, teaching plane and returned chip at desktop sizes', async ({ page }) => {
  test.setTimeout(90000)
  await mkdir('.local/chip-v2/final', { recursive: true })
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  const reports = []
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    const root = page.getByTestId('scene-root')
    await expect(root).toHaveAttribute('data-chip-ready', 'true')
    await expect(root).toHaveAttribute('data-reveal', '0.0000')
    await page.screenshot({ path: `.local/chip-v2/final/assembled-${width}.png` })
    await page.getByRole('button', { name: '进入芯片' }).click()
    await expect(root).toHaveAttribute('data-reveal', '1.0000')
    await expect(root).toHaveAttribute('data-chip-visible', 'false')
    await expect(page.locator('[data-module="pc"]')).toBeVisible()
    await expect(page.locator('[data-module="regfile"]')).toBeVisible()
    await expect(page.locator('[data-module="alu"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('radio', { name: '专业模式' }).click()
    await expect(page.getByRole('heading', { name: 'RTL 信号快照' })).toBeVisible()
    await page.screenshot({ path: `.local/chip-v2/final/workbench-${width}.png` })
    reports.push(await root.evaluate(el => ({ viewport: [innerWidth, innerHeight], calls: el.dataset.drawCalls, triangles: el.dataset.triangles, geometries: el.dataset.geometries, textures: el.dataset.textures })))
    await page.getByRole('button', { name: '探索芯片', exact: true }).click()
    await expect(root).toHaveAttribute('data-reveal', '0.0000')
    await page.screenshot({ path: `.local/chip-v2/final/returned-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  // Explicit DEV-only still pins the existing reveal pose; normal forward /
  // reverse / interrupted motion is tested separately without this override.
  await page.goto('/?chip-inspect=0.38')
  await expect(page.getByTestId('scene-root')).toHaveAttribute('data-chip-ready', 'true')
  await page.getByRole('button', { name: '进入芯片' }).click()
  await expect(page.getByTestId('scene-root')).toHaveAttribute('data-reveal', '0.3800')
  await page.screenshot({ path: '.local/chip-v2/final/disassembly-1440.png' })
  await writeFile('.local/chip-v2/final/desktops.json', JSON.stringify({ reports, errors }, null, 2))
  expect(errors).toEqual([])
})
