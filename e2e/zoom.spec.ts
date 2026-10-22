import { chromium, expect, test } from '@playwright/test'
import { writeFile } from 'node:fs/promises'

test('native Chromium 125% and 150% page zoom keeps panels accessible', async ({ baseURL }) => {
  test.setTimeout(90000)
  // Temporary isolated browser profile, never the user's personal Chrome profile.
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium', headless: true, viewport: null,
    args: ['--window-size=1440,900', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const evidence: unknown[] = []
  try {
    const settings = context.pages()[0]
    await settings.goto('chrome://settings/appearance')
    const page = await context.newPage()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()) })
    for (const rate of [1.25, 1.5]) {
      await settings.bringToFront()
      await settings.evaluate(value => {
        const api = (globalThis as unknown as { chrome: { settingsPrivate: { setDefaultZoom: (value: number, callback: () => void) => void } } }).chrome.settingsPrivate
        api.setDefaultZoom(value, () => {})
      }, rate)
      await page.bringToFront()
      await page.goto(baseURL!)
      await expect(page.locator('.die-mark')).toBeVisible({ timeout: 20000 })
      const before = (await page.locator('.app-header').boundingBox())!
      expect(await page.evaluate(() => devicePixelRatio)).toBeCloseTo(rate, 2)
      await page.getByRole('button', { name: '进入芯片' }).focus()
      await page.keyboard.press('Enter')
      const after = (await page.locator('.app-header').boundingBox())!
      expect(after.x).toBe(before.x); expect(after.width).toBe(before.width)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.getByRole('button', { name: '单步指令', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '单步指令', exact: true }).focus()
      await page.keyboard.press('Enter')
      await expect(page.getByTestId('register-1').locator('code')).toHaveText('5')
      await page.getByLabel('教学程序').selectOption('arithmetic')
      await page.getByRole('button', { name: '复制为我的项目', exact: true }).focus()
      await page.keyboard.press('Enter')
      await page.getByLabel('内存数据视图').selectOption('initial')
      for (const target of ['ROM', 'RAM']) {
        const panel = page.locator(target === 'ROM' ? '.program-panel .hex-panel' : '.memory-panel .hex-panel')
        await panel.locator(':scope > summary').focus(); await page.keyboard.press('Enter')
        const filename = `${target}-${'very-long-filename-'.repeat(10)}.hex`
        await page.getByLabel(`${target} HEX 文件`, { exact: true }).setInputFiles({ name: filename, mimeType: 'text/plain', buffer: Buffer.from(target === 'ROM' ? '00500093' : '0000002a') })
        await expect(panel.locator('.picked-file-name')).toHaveAttribute('title', filename)
        expect(await panel.locator('.hex-file-picker').evaluate(el => {
          const box = el.getBoundingClientRect(), name = el.querySelector('.picked-file-name')!.getBoundingClientRect(), button = el.querySelector('button')!.getBoundingClientRect()
          return name.right <= box.right + 1 && button.right <= box.right + 1 && name.left >= box.left - 1 && name.top >= button.bottom
        })).toBe(true)
      }
      await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved')
      await page.locator('.app-footer').scrollIntoViewIfNeeded()
      await expect(page.locator('.app-footer')).toBeInViewport()
      evidence.push(await page.evaluate(() => ({ zoom: devicePixelRatio, innerWidth, innerHeight, outerWidth, scrollWidth: document.documentElement.scrollWidth })))
      await page.evaluate(() => scrollTo(0, 0))
      // Geometry and actual DPR are the evidence here. Screenshot capture with
      // native zoom + viewport:null stalls on some Windows headless GPUs.
    }
    expect(errors).toEqual([])
    await writeFile('.local/sprint021-native-zoom.json', JSON.stringify(evidence, null, 2))
  } finally { await context.close() }
})
