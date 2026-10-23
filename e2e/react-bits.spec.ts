import { expect, test } from '@playwright/test'

interface GpuStats { draws: number; live: number; contexts: number }
declare global { interface Window { gradientStats: GpuStats } }

test('ASCII lifecycle and restrained radio keyboard motion preserve the CPU Canvas', async ({ page }) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await page.addInitScript(() => {
    window.gradientStats = { draws: 0, live: 0, contexts: 0 }
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, options?: unknown) {
      const context = Reflect.apply(original, this, [id, options]) as RenderingContext | null
      if (id === 'webgl2' && this.classList.contains('gradient-ascii-canvas') && context instanceof WebGL2RenderingContext) {
        const stats = window.gradientStats
        stats.contexts++
        const draw = context.drawArrays.bind(context)
        context.drawArrays = (...args) => { stats.draws++; draw(...args) }
        const track = <T>(create: () => T, remove: (item: T) => void) => {
          const live = new Set<T>()
          return {
            create: () => { const item = create(); if (item) { live.add(item); stats.live++ } return item },
            remove: (item: T) => { if (live.delete(item)) stats.live--; remove(item) },
          }
        }
        const programs = track(context.createProgram.bind(context), context.deleteProgram.bind(context))
        context.createProgram = programs.create; context.deleteProgram = programs.remove
        const textures = track(context.createTexture.bind(context), context.deleteTexture.bind(context))
        context.createTexture = textures.create; context.deleteTexture = textures.remove
        const arrays = track(context.createVertexArray.bind(context), context.deleteVertexArray.bind(context))
        context.createVertexArray = arrays.create; context.deleteVertexArray = arrays.remove
        const frames = track(context.createFramebuffer.bind(context), context.deleteFramebuffer.bind(context))
        context.createFramebuffer = frames.create; context.deleteFramebuffer = frames.remove
        const shaders = new Set<WebGLShader>()
        const createShader = context.createShader.bind(context), deleteShader = context.deleteShader.bind(context)
        context.createShader = type => { const item = createShader(type); if (item) { shaders.add(item); stats.live++ } return item }
        context.deleteShader = item => { if (item && shaders.delete(item)) stats.live--; deleteShader(item) }
      }
      return context
    } as typeof original
  })
  await page.goto('/')
  await expect(page.locator('.gradient-ascii-container')).toHaveAttribute('data-state', 'webgl')
  await expect(page.getByTestId('scene-root')).toHaveAttribute('data-chip-ready', 'true')
  const cpu = await page.locator('.persistent-scene canvas').elementHandle()
  expect(await page.locator('.gradient-ascii-canvas').evaluate(canvas => {
    const el = canvas as HTMLCanvasElement, rect = el.getBoundingClientRect()
    return el.width <= rect.width + 1 && el.height <= rect.height + 1 && el.width * el.height <= 1280 * 720 + 2000 && getComputedStyle(el).pointerEvents === 'none'
  })).toBe(true)
  const before = await page.evaluate(() => window.gradientStats.draws)
  await page.waitForTimeout(1100) // Measure an actual sampling interval, not readiness.
  const after = await page.evaluate(() => window.gradientStats.draws)
  expect(after - before).toBeGreaterThan(0)
  expect(after - before).toBeLessThanOrEqual(46) // Two draw calls per frame, <=20fps with timer tolerance.
  await page.screenshot({ path: '.local/sprint03-home-ascii.png' })
  const mark = await page.locator('.chip-hit-anchor').boundingBox()
  const cameraBefore = await page.getByTestId('scene-root').getAttribute('data-camera')
  expect(mark).not.toBeNull()
  // Decorated background passes drag/click through to the original scene anchor.
  await page.mouse.move(mark!.x + mark!.width / 2, mark!.y + mark!.height / 2)
  await page.mouse.down(); await page.mouse.move(mark!.x + mark!.width / 2 + 35, mark!.y + mark!.height / 2 + 15, { steps: 5 }); await page.mouse.up()
  await expect.poll(() => page.getByTestId('scene-root').getAttribute('data-camera')).not.toBe(cameraBefore)
  await expect(page.getByRole('button', { name: '进入芯片' })).toBeVisible()
  await page.getByRole('button', { name: '进入芯片' }).click()
  await expect(page.locator('.gradient-ascii-container')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => window.gradientStats.live)).toBe(0)
  const stopped = await page.evaluate(() => window.gradientStats.draws)
  await page.waitForTimeout(150)
  expect(await page.evaluate(() => window.gradientStats.draws)).toBe(stopped)
  const demo = page.getByRole('radio', { name: '演示模式' }), pro = page.getByRole('radio', { name: '专业模式' })
  await demo.focus(); await page.keyboard.press('ArrowRight')
  await expect(pro).toBeChecked(); await expect(pro).toBeFocused()
  await expect(page.getByRole('heading', { name: 'RTL 信号快照' })).toBeVisible()
  await page.keyboard.press('Home'); await expect(demo).toBeChecked()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '探索芯片', exact: true }).click()
  await expect(page.locator('.gradient-ascii-container')).toBeAttached()
  await expect(page.locator('.gradient-ascii-canvas')).toHaveCount(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.gradient-ascii-container')).toHaveAttribute('data-state', 'webgl')
  // Dynamic reduction must also dispose an already live background.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.evaluate(() => window.gradientStats.live)).toBe(0)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect(page.locator('.gradient-ascii-container')).toHaveAttribute('data-state', 'webgl')
  // Context loss uses the CSS fallback and frees surviving allocations.
  await page.locator('.gradient-ascii-canvas').evaluate(canvas => (canvas as HTMLCanvasElement).getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext())
  await expect(page.locator('.gradient-ascii-container')).toHaveAttribute('data-state', 'fallback')
  await expect.poll(() => page.evaluate(() => window.gradientStats.live)).toBe(0)
  expect(await page.locator('.persistent-scene canvas').evaluate((el, original) => el === original, cpu)).toBe(true)
  expect(errors).toEqual([])
})

test('WebGL2 background unavailable leaves CPU usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, options?: unknown) {
      if (this.classList.contains('gradient-ascii-canvas')) return null
      return Reflect.apply(original, this, [id, options])
    } as typeof original
  })
  await page.goto('/')
  await expect(page.locator('.gradient-ascii-container')).toHaveAttribute('data-state', 'fallback')
  await expect(page.getByTestId('scene-root')).toHaveAttribute('data-chip-ready', 'true')
  await page.getByRole('button', { name: '进入芯片' }).click()
  await page.getByLabel('传播速率').selectOption('2')
  await page.getByRole('button', { name: '运行', exact: true }).click()
  await expect(page.getByTestId('register-3').locator('code')).toHaveText('12', { timeout: 20000 })
})

test('partial shader initialization is disposed on fallback', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.addInitScript(() => {
    window.gradientStats = { draws: 0, live: 0, contexts: 0 }
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, id: string, options?: unknown) {
      const context = Reflect.apply(original, this, [id, options]) as RenderingContext | null
      if (this.classList.contains('gradient-ascii-canvas') && context instanceof WebGL2RenderingContext) {
        const stats = window.gradientStats
        stats.contexts++
        const create = context.createProgram.bind(context), remove = context.deleteProgram.bind(context)
        context.createProgram = () => { const program = create(); if (program) stats.live++; return program }
        context.deleteProgram = program => { if (program) stats.live--; remove(program) }
        const createShader = context.createShader.bind(context), deleteShader = context.deleteShader.bind(context)
        context.createShader = type => { const shader = createShader(type); if (shader) stats.live++; return shader }
        context.deleteShader = shader => { if (shader) stats.live--; deleteShader(shader) }
        const status = context.getShaderParameter.bind(context)
        context.getShaderParameter = (shader, param) => param === context.COMPILE_STATUS ? false : status(shader, param)
      }
      return context
    } as typeof original
  })
  await page.goto('/')
  await expect(page.locator('.gradient-ascii-container')).toHaveAttribute('data-state', 'fallback')
  await expect.poll(() => page.evaluate(() => window.gradientStats.contexts)).toBeGreaterThan(0)
  expect(await page.evaluate(() => window.gradientStats.live)).toBe(0)
  await expect(page.locator('.gradient-ascii-canvas')).toHaveCount(0)
  await page.getByRole('button', { name: '进入芯片' }).click()
  await expect(page.getByRole('heading', { name: '让指令，走一遍。' })).toBeVisible()
  expect(errors).toEqual([])
})
