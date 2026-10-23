import { expect, test, type Page } from '@playwright/test'

async function openLab(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByTestId('scene-root')).toHaveAttribute('data-chip-ready', 'true', { timeout: 20000 })
  await page.getByRole('button', { name: '进入芯片' }).click()
  await expect(page.getByText('Register File', { exact: true })).toBeVisible({ timeout: 20000 })
}

test('viewport shell, independent scroll, separators and compact zoom layouts', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.getByTestId('scene-root')).toHaveAttribute('data-chip-ready', 'true', { timeout: 20000 })
  const header = await page.locator('.app-header').boundingBox()
  await page.getByRole('button', { name: '进入芯片' }).click()
  expect(await page.locator('.app-header').boundingBox()).toEqual(header)
  const canvas = await page.locator('.persistent-scene canvas').elementHandle()
  for (const [width, height] of [[1280, 720], [1440, 900], [1920, 1080]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight && document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect.poll(() => page.evaluate(() => {
      const height = innerHeight - 76 - 40 - document.querySelector('.workspace-heading')!.getBoundingClientRect().height - 2
      const stage = Math.max(318, Math.min(height * .57, height - 168))
      const expected = stage - document.querySelector('.scene-toolbar')!.getBoundingClientRect().height - document.querySelector('.scene-bottom')!.getBoundingClientRect().height
      return Math.abs(document.querySelector('.scene-viewport')!.getBoundingClientRect().height - expected)
    })).toBeLessThan(1)
    const anchor = await page.getByTestId('scene-anchor').boundingBox()
    const footer = await page.locator('.app-footer').boundingBox()
    expect(anchor!.height).toBeGreaterThan(175)
    for (const selector of ['.program-panel', '.state-panel', '.details-scroll']) {
      await page.locator(selector).evaluate(el => {
        const content = document.createElement('div'); content.className = 'overflow-fixture'; content.style.height = '1800px'; content.textContent = '滚动压力内容'; el.append(content)
      })
      expect(await page.locator(selector).evaluate(el => { el.scrollTop = 100; return el.scrollTop })).toBeGreaterThan(0)
      expect(await page.getByTestId('scene-anchor').boundingBox()).toEqual(anchor)
      expect(await page.locator('.app-footer').boundingBox()).toEqual(footer)
    }
    await page.locator('.overflow-fixture').evaluateAll(nodes => nodes.forEach(n => n.remove()))
    await page.screenshot({ path: `.local/sprint021-${width}.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const name of ['程序与 CPU 区域宽度', 'CPU 与状态区域宽度', '三维与讲解区域高度']) {
    const separator = page.getByRole('separator', { name })
    const box = (await separator.boundingBox())!
    const before = Number(await separator.getAttribute('aria-valuenow'))
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + (box.width < box.height ? 60 : 0), box.y + box.height / 2 + (box.width < box.height ? 0 : 50), { steps: 5 })
    expect(Number(await separator.getAttribute('aria-valuenow'))).not.toBe(before) // live before pointerup
    await page.mouse.move(3000, 2000)
    await page.mouse.up()
    expect(Number(await separator.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(Number(await separator.getAttribute('aria-valuemax')))
    await separator.focus(); await page.keyboard.press('Home')
    await page.keyboard.press(name === '三维与讲解区域高度' ? 'ArrowUp' : 'ArrowLeft')
    expect(Number(await separator.getAttribute('aria-valuenow'))).not.toBe(before)
    await separator.dblclick()
  }
  expect(await page.locator('.persistent-scene canvas').evaluate((node, original) => node === original, canvas)).toBe(true)
  // Equivalent CSS viewport sizes for 125% / 150% zoom at a 1440×900 window.
  // This covers reflow, not a claim about native browser chrome or device rasterization.
  for (const [width, height] of [[1152, 720], [960, 600], [390, 844]]) {
    await page.setViewportSize({ width, height })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: '复位 CPU' }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: `.local/sprint021-compact-${width}.png`, fullPage: true })
  }
  expect(errors).toEqual([])
})

test('wheel and pointer events only control the actual 3D region', async ({ page }) => {
  await openLab(page)
  const root = page.getByTestId('scene-root')
  const camera = () => root.getAttribute('data-camera')
  await expect(root).toHaveAttribute('data-camera', /./)
  const initial = await camera()
  const box = (await page.getByTestId('scene-anchor').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, 200)
  await expect.poll(camera).not.toBe(initial)
  // Let OrbitControls damping settle before checking unrelated interactions.
  await page.waitForTimeout(500)
  for (const selector of ['.program-panel', '.state-panel', '.details-scroll', '.app-header']) {
    const before = await camera()
    await page.locator(selector).hover()
    await page.mouse.wheel(0, 180)
    await page.waitForTimeout(150)
    expect(await camera()).toBe(before)
  }
  const beforeDrag = await camera()
  const handle = (await page.getByRole('separator', { name: '程序与 CPU 区域宽度' }).boundingBox())!
  await page.mouse.move(handle.x + 4, handle.y + 50); await page.mouse.down()
  await page.mouse.move(handle.x + 80, handle.y + 80); await page.mouse.up()
  expect(await camera()).toBe(beforeDrag)
  const cdp = await page.context().newCDPSession(page)
  const listeners = async () => {
    const object = await cdp.send('Runtime.evaluate', { expression: 'document.querySelector("[data-testid=scene-anchor]")' })
    const result = await cdp.send('DOMDebugger.getEventListeners', { objectId: object.result.objectId! })
    return result.listeners.map(l => l.type).sort()
  }
  const initialListeners = await listeners()
  expect(initialListeners).toContain('wheel')
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: '探索芯片', exact: true }).click()
    await page.getByRole('button', { name: 'CPU 工作台', exact: true }).click()
  }
  expect(await listeners()).toEqual(initialListeners)
  await cdp.detach()
})

test('single transfer, rate changes, pause, phase seeking and replay never commit CPU twice', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
  await openLab(page)
  await expect(page.getByLabel('传播速率')).toHaveValue('0.5')
  await page.getByRole('button', { name: '单步指令', exact: true }).click()
  await page.getByRole('button', { name: '01 取指 Read' }).click()
  const architecture = () => page.locator('[data-testid^="register-"], [data-testid^="memory-"], [data-testid="pc"], .pc-state small').allTextContents()
  const after = await architecture()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.getByLabel('传播速率').selectOption('0.25')
  const root = page.getByTestId('scene-root')
  const time = async () => Number(await root.getAttribute('data-flow-time'))
  await page.getByRole('button', { name: '单步传递', exact: true }).click()
  const epoch = await page.getByTestId('transfer-status').getAttribute('data-playback-epoch')
  await expect(root).toHaveAttribute('data-playback-epoch', epoch!)
  await expect.poll(time).toBeGreaterThan(.12)
  const beforeRateChange = await time()
  await page.getByLabel('传播速率').selectOption('0.5')
  const afterRateChange = await time()
  expect(afterRateChange).toBeGreaterThanOrEqual(beforeRateChange)
  expect(afterRateChange - beforeRateChange).toBeLessThan(.3)
  await page.getByRole('button', { name: '暂停讲解' }).click()
  await expect(root).toHaveAttribute('data-flow-playing', 'false')
  const paused = await time()
  await page.getByLabel('传播速率').selectOption('2')
  await page.waitForTimeout(300)
  expect(await time()).toBe(paused)
  await expect(page.getByTestId('transfer-status')).toContainText('1 /')
  await page.getByRole('button', { name: '继续讲解' }).click()
  await expect(page.getByRole('button', { name: '单步传递', exact: true })).toBeEnabled()
  // The HTML driver can finish before a slow software WebGL renderer draws its
  // endpoint. Require that exact scheduled endpoint before measuring freeze.
  const scheduledEnd = Number(await page.getByTestId('transfer-status').getAttribute('data-transfer-end'))
  expect(scheduledEnd).toBeGreaterThan(0)
  await expect.poll(time).toBeCloseTo(scheduledEnd, 4)
  const end = await time()
  await page.waitForTimeout(300)
  expect(await time()).toBe(end)
  await expect(page.getByRole('button', { name: '01 取指 Read' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '单步传递', exact: true }).click()
  await expect(page.getByTestId('transfer-status')).toContainText('2 /')
  await expect(page.getByTestId('transfer-status')).toContainText('imem → regfile')
  await expect(page.getByTestId('transfer-status')).toContainText('imem → decoder') // actual parallel group
  await expect(page.getByRole('button', { name: '单步传递', exact: true })).toBeEnabled()
  for (let i = 0; i < 20; i++) {
    if ((await page.getByTestId('transfer-status').textContent())?.includes('已完成')) break
    await page.getByRole('button', { name: '单步传递', exact: true }).click()
    await expect.poll(async () => (await page.getByTestId('transfer-status').textContent())?.includes('传播中')).toBe(false)
  }
  await expect(page.getByTestId('transfer-status')).toContainText('已完成')
  expect(await architecture()).toEqual(after)
  await page.getByRole('button', { name: '04 访存 可跳过' }).click()
  await page.getByRole('button', { name: '单步传递', exact: true }).click()
  await expect(page.getByRole('button', { name: '05 写回 Commit' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '回放', exact: true }).click()
  await expect(page.getByRole('button', { name: '01 取指 Read' })).toHaveAttribute('aria-pressed', 'true')
  expect(await architecture()).toEqual(after)
  await page.getByRole('button', { name: '复位 CPU' }).click()
  await expect(page.getByRole('button', { name: '单步传递', exact: true })).toBeDisabled()
  await expect(page.getByTestId('pc')).toHaveText('0x00000000')
  expect(errors).toEqual([])
})
