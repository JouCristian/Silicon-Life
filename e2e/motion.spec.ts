import { expect, test, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

function sampleFrames(page: Page, duration: number) {
  return page.evaluate(ms => new Promise<{ time: number; renderTime: number; reveal: number; x: number; y: number; flow: number; routes: string }[]>(resolve => {
    const frames: { time: number; renderTime: number; reveal: number; x: number; y: number; flow: number; routes: string }[] = []
    const start = performance.now()
    const sample = (now: number) => {
      const root = document.querySelector<HTMLElement>('[data-testid="scene-root"]')!
      frames.push({ time: now - start, renderTime: Number(root.dataset.renderTime), reveal: Number(root.dataset.reveal), x: Number(root.dataset.anchorX), y: Number(root.dataset.anchorY), flow: Number(root.dataset.flowTime), routes: root.dataset.flowRoutes ?? '' })
      if (now - start < ms) requestAnimationFrame(sample)
      else resolve(frames)
    }
    requestAnimationFrame(sample)
  }), duration)
}

test('forward, reverse and interrupted reveal preserve Canvas and continuous screen motion', async ({ page }, info) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  await page.goto('/')
  await expect(page.locator('.die-mark')).toBeVisible({ timeout: 20000 })
  const canvas = await page.locator('canvas').elementHandle()
  const before = await page.locator('canvas').boundingBox()
  const root = page.getByTestId('scene-root')
  await page.screenshot({ path: '.local/sprint02-reveal-0.png' })
  const forwardRecording = sampleFrames(page, 1800)
  await page.getByRole('button', { name: '进入芯片' }).click()
  await expect.poll(async () => Number(await root.getAttribute('data-reveal'))).toBeGreaterThan(.08)
  await page.screenshot({ path: '.local/sprint02-reveal-mid.png' })
  const forward = await forwardRecording
  await expect.poll(async () => Number(await root.getAttribute('data-reveal'))).toBeGreaterThan(.995)
  await page.screenshot({ path: '.local/sprint02-reveal-1.png' })
  expect(await page.locator('canvas').evaluate((node, original) => node === original, canvas)).toBe(true)
  expect(await page.locator('canvas').boundingBox()).toEqual(before)
  expect(forward.some(f => f.reveal > .15 && f.reveal < .85)).toBe(true)
  const reverseRecording = sampleFrames(page, 1800)
  await page.getByRole('button', { name: '探索芯片', exact: true }).click()
  await expect.poll(async () => Number(await root.getAttribute('data-reveal'))).toBeLessThan(.8)
  await page.screenshot({ path: '.local/sprint02-return-mid.png' })
  const reverse = await reverseRecording
  await expect.poll(async () => Number(await root.getAttribute('data-reveal'))).toBeLessThan(.005)
  await page.screenshot({ path: '.local/sprint02-return-0.png' })
  await info.attach('continuous-reveal-frames', { body: JSON.stringify({ forward, reverse }), contentType: 'application/json' })
  await writeFile('.local/sprint02-motion-samples.json', JSON.stringify({ forward, reverse }, null, 2))
  for (const frames of [forward, reverse]) {
    expect(frames.length).toBeGreaterThan(15)
    const speeds = frames.slice(1).filter((f, i) => f.renderTime > frames[i].renderTime).map(f => {
      const i = frames.indexOf(f)
      return Math.hypot(f.x - frames[i - 1].x, f.y - frames[i - 1].y) / (f.renderTime - frames[i - 1].renderTime)
    })
    expect(Math.max(...speeds)).toBeLessThan(2200)
  }
  await page.getByRole('button', { name: 'CPU 工作台', exact: true }).click()
  await expect.poll(async () => Number(await root.getAttribute('data-reveal'))).toBeGreaterThan(.15)
  await page.getByRole('button', { name: '探索芯片', exact: true }).click()
  await expect.poll(async () => Number(await root.getAttribute('data-reveal'))).toBeLessThan(.005)
  expect(await page.locator('canvas').evaluate((node, original) => node === original, canvas)).toBe(true)
  expect(errors).toEqual([])
})

test('trace pulses travel directionally, pause in place and replay without memory commits', async ({ page }, info) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByRole('button', { name: '进入芯片' }).click()
  await page.getByLabel('教学程序').selectOption('memory')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.getByTestId('register-3').locator('code')).toHaveText('42')
  await expect(page.getByRole('button', { name: '运行', exact: true })).toBeDisabled()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.getByTestId('scene-root')).toHaveAttribute('data-reduced-motion', 'false')
  // Record before replay so short transfers cannot finish between polling and sampling.
  const playbackRecording = sampleFrames(page, 2600)
  await page.getByLabel('执行记录').selectOption('2')
  await expect(page.getByRole('button', { name: '04 访存 Store' })).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 })
  const root = page.getByTestId('scene-root')
  await expect.poll(async () => Number(await root.getAttribute('data-flow-time'))).toBeGreaterThan(.08)
  await page.getByRole('button', { name: '暂停讲解', exact: true }).click()
  const paused = await sampleFrames(page, 350)
  const travelling = (await playbackRecording).filter(f => f.routes.includes('dmem_wdata'))
  await info.attach('trace-flow-frames', { body: JSON.stringify({ travelling, paused }), contentType: 'application/json' })
  await writeFile('.local/sprint02-flow-samples.json', JSON.stringify({ travelling, paused }, null, 2))
  expect(new Set(paused.map(f => f.flow)).size).toBe(1)
  const progress = travelling.map(f => Number(f.routes.split(',').find(route => route.startsWith('dmem_wdata:'))!.split(':')[1]))
  expect(progress.some(p => p > 0 && p < 1)).toBe(true)
  expect(Math.max(...progress)).toBeGreaterThan(Math.min(...progress))
  expect(travelling.every(f => f.routes.includes('mem_control') && !f.routes.includes('wb_data'))).toBe(true)
  const architecture = await page.locator('[data-testid^="register-"], [data-testid^="memory-"], [data-testid="pc"]').allTextContents()
  await page.getByRole('button', { name: '继续讲解', exact: true }).click()
  await expect(page.getByRole('button', { name: '05 写回 Commit' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '03 执行 Compute' }).click()
  expect(await page.locator('[data-testid^="register-"], [data-testid^="memory-"], [data-testid="pc"]').allTextContents()).toEqual(architecture)
  await expect(page.getByTestId('memory-64').locator('code')).toHaveText('42')
  await page.getByRole('button', { name: '芯生首页' }).scrollIntoViewIfNeeded()
  await expect.poll(async () => {
    const anchor = await page.getByTestId('scene-anchor').boundingBox()
    return Math.abs(Number(await root.getAttribute('data-anchor-y')) - (anchor!.y + anchor!.height / 2))
  }).toBeLessThan(2)
  await page.screenshot({ path: '.local/sprint02-flow.png' })
  expect(errors).toEqual([])
})
