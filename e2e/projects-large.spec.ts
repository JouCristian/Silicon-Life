import { expect, test, type Page } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'

async function openLab(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/')
  await page.getByRole('button', { name: '进入芯片' }).click()
  await expect(page.getByLabel('教学程序')).toBeEnabled({ timeout: 15000 })
  await expect(page.getByText('Register File', { exact: true })).toBeVisible()
}
async function saved(page: Page) { await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved', { timeout: 15000 }) }
async function rom(page: Page, text: string, name = 'program.hex') {
  const panel = page.locator('.program-panel .hex-panel')
  if (!await panel.evaluate(el => el.hasAttribute('open'))) await panel.locator(':scope > summary').click()
  await page.getByLabel('ROM HEX 文件', { exact: true }).setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(text) })
  await expect(page.getByRole('button', { name: '确认导入 ROM' })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: '确认导入 ROM' }).click()
  await saved(page)
}
async function rename(page: Page, name: string) {
  await page.bringToFront()
  await page.getByRole('button', { name: '重命名', exact: true }).click()
  await page.getByLabel('项目名称').fill(name)
  await page.getByRole('button', { name: '保存名称', exact: true }).click()
  await saved(page)
}

test('project CRUD, ROM/RAM/register persistence, JSON backups and deletion confirmation', async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await openLab(page)
  await page.getByRole('button', { name: '新建项目', exact: true }).click(); await rename(page, '实验 A')
  const a = await page.getByLabel('教学程序').inputValue()
  await rom(page, '04002183')
  await page.getByLabel('内存数据视图').selectOption('initial')
  await page.getByRole('button', { name: '写入初始 RAM', exact: true }).click()
  await page.getByText('设置初始寄存器', { exact: true }).click()
  await page.getByLabel('初始寄存器编号').selectOption('2')
  await page.getByLabel('寄存器初始值').fill('99')
  await page.getByRole('button', { name: '写入初始值', exact: true }).click(); await saved(page)
  await page.getByRole('button', { name: '快速运行', exact: true }).click()
  await expect(page.getByTestId('register-3').locator('code')).toHaveText('42')
  await page.reload(); await page.getByRole('button', { name: '进入芯片' }).click()
  await expect(page.getByLabel('教学程序')).toHaveValue(a)
  await expect(page.getByTestId('register-2').locator('code')).toHaveText('99')
  await expect(page.getByTestId('register-3').locator('code')).toHaveText('0')
  await expect(page.getByTestId('memory-64').locator('code')).toHaveText('42')
  await expect(page.locator('.program-list li')).toContainText('lw x3, 64(x0)')
  await page.getByRole('button', { name: '复制项目', exact: true }).click(); const b = await page.getByLabel('教学程序').inputValue()
  await rename(page, '实验 B')
  await page.getByLabel('内存数据视图').selectOption('initial')
  await page.getByLabel('RAM 初始数据').fill('7'); await page.getByRole('button', { name: '写入初始 RAM', exact: true }).click(); await saved(page)
  await page.getByLabel('教学程序').selectOption(a)
  await expect(page.getByTestId('memory-64').locator('code')).toHaveText('42')
  await page.getByText('项目 JSON 备份', { exact: true }).click()
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: '导出完整项目 JSON' }).click()
  const file = await downloading, filePath = (await file.path())!, json = JSON.parse(await readFile(filePath, 'utf8'))
  expect(json.initialRAM[64]).toBe(42); expect(json.initialRegisters[2]).toBe(99); expect(json.instructionROM).toEqual([0x04002183])
  expect(json).not.toHaveProperty('history')
  await page.getByLabel('项目 JSON 文件').setInputFiles(filePath)
  await expect(page.getByLabel('教学程序')).not.toHaveValue(a); await saved(page)
  const imported = await page.getByLabel('教学程序').inputValue()
  await expect(page.getByTestId('memory-64').locator('code')).toHaveText('42')
  await page.getByLabel('项目 JSON 文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...json, schemaVersion: 999 })) })
  await expect(page.locator('.project-controls').getByRole('alert')).toContainText('schemaVersion')
  await expect(page.getByLabel('教学程序')).toHaveValue(imported)
  page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: '删除项目', exact: true }).click()
  await expect(page.getByLabel('教学程序')).toHaveValue(imported)
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: '删除项目', exact: true }).click(); await saved(page)
  await expect(page.getByLabel('教学程序')).toHaveValue('arithmetic')
  await page.getByLabel('教学程序').selectOption(b)
  await expect(page.getByTestId('memory-64').locator('code')).toHaveText('7')
  await page.getByLabel('教学程序').selectOption(a); await saved(page)
  await page.reload(); await page.getByRole('button', { name: '进入芯片' }).click()
  await expect(page.getByLabel('教学程序')).toHaveValue(a)
  await expect(page.getByLabel('教学程序').locator('option')).toHaveCount(5)
  expect(errors).toEqual([])
})

test('65536-word ROM: worker import, bounded DOM, PC navigation, real execution and heap trend', async ({ page }, info) => {
  test.setTimeout(180000)
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  await openLab(page); await page.getByRole('button', { name: '新建项目', exact: true }).click(); await saved(page)
  const cdp = await page.context().newCDPSession(page), metrics: Record<string, unknown>[] = []
  const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize as number }
  const baselineHeap = await heap()
  for (const count of [4096, 65536]) {
    await page.evaluate(() => {
      const gaps: number[] = [], begin = performance.now(); let previous = begin
      const timer = setInterval(() => { const now = performance.now(); gaps.push(now - previous); previous = now }, 16)
      Object.assign(window, { importBenchmark: { gaps, begin, timer } })
    })
    const start = Date.now()
    await rom(page, `v2.0 raw\n${'00108093\n'.repeat(count)}`)
    const importMs = Date.now() - start
    const responsiveness = await page.evaluate(() => {
      const data = (window as unknown as { importBenchmark: { gaps: number[]; begin: number; timer: number } }).importBenchmark
      clearInterval(data.timer)
      return { heartbeatSamples: data.gaps.length, maxHeartbeatGapMs: Math.max(0, ...data.gaps), domNodes: document.querySelectorAll('*').length, rows: document.querySelectorAll('.program-list li').length }
    })
    expect(responsiveness.rows).toBeLessThanOrEqual(16)
    expect(responsiveness.domNodes).toBeLessThan(2500)
    expect(responsiveness.heartbeatSamples).toBeGreaterThan(0)
    await page.getByLabel('跳转 PC 地址').fill(`0x${((count - 1) * 4).toString(16)}`)
    await page.getByRole('button', { name: '跳转', exact: true }).click()
    await expect(page.locator('.program-list li').last()).toContainText(`0x${((count - 1) * 4).toString(16).padStart(8, '0')}`)
    const runStart = Date.now(); await page.getByRole('button', { name: '快速运行', exact: true }).click()
    await expect(page.getByTestId('register-1').locator('code')).toHaveText(String(count), { timeout: 90000 })
    await expect(page.getByTestId('pc')).toHaveText(`0x${(count * 4).toString(16).padStart(8, '0')}`)
    await expect(page.getByLabel('执行记录').locator('option')).toHaveCount(128)
    const runMs = Date.now() - runStart
    await page.getByLabel('教学程序').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `.local/sprint031-rom-${count}.png` })
    let restoreMs: number | undefined
    if (count === 65536) {
      const restoreStart = Date.now()
      await page.reload(); await page.getByRole('button', { name: '进入芯片' }).click()
      await expect(page.getByLabel('教学程序')).toBeEnabled()
      await expect(page.locator('.rom-capacity')).toContainText('256.00 KiB / 256 KiB')
      await expect(page.locator('.program-list li')).toHaveCount(16)
      await expect(page.getByTestId('register-1').locator('code')).toHaveText('0')
      restoreMs = Date.now() - restoreStart
    }
    metrics.push({ count, importMs, runMs, restoreMs, ...responsiveness, heapAfterGC: await heap() })
  }
  // Repeated execution resets architecture, not retained database configuration.
  await rom(page, `v2.0 raw\n4096*00108093`)
  for (let n = 0; n < 3; n++) {
    await page.getByRole('button', { name: '快速运行', exact: true }).click()
    await expect(page.getByTestId('register-1').locator('code')).toHaveText('4096', { timeout: 30000 })
    await page.getByRole('button', { name: '复位 CPU' }).click()
    metrics.push({ repeat: n + 1, heapAfterGC: await heap() })
  }
  const retained = await heap(); expect(retained - baselineHeap).toBeLessThan(64 * 1024 * 1024)
  await page.screenshot({ path: '.local/sprint031-large-rom.png' })
  await writeFile('.local/sprint031-performance.json', JSON.stringify({ baselineHeap, retained, metrics }, null, 2))
  await info.attach('large-ROM-performance', { body: JSON.stringify(metrics), contentType: 'application/json' })
  await rom(page, '00500093 ffffffff')
  await expect(page.locator('.program-list li').nth(1)).toContainText('当前 CPU 不支持该指令')
  await page.getByRole('button', { name: '快速运行', exact: true }).click()
  await expect(page.locator('.execution-status')).toContainText('0xffffffff')
  await expect(page.getByTestId('pc')).toHaveText('0x00000004')
  await expect(page.getByTestId('register-1').locator('code')).toHaveText('5')
  await expect(page.getByTestId('register-2').locator('code')).toHaveText('0')
  expect(errors).toEqual([])
})

test('large RAM persists, SW changes runtime only, loops pause and stop at a renewable budget', async ({ page }) => {
  test.setTimeout(90000)
  await openLab(page); await page.getByRole('button', { name: '新建项目', exact: true }).click()
  await page.getByLabel('内存数据视图').selectOption('initial')
  const ramMetrics: Record<string, number>[] = []
  for (const size of [65536, 262144]) {
    const editStart = Date.now()
    await page.getByLabel('RAM 容量').selectOption(String(size))
    await page.getByLabel('RAM 编辑地址').fill(String(size - 4)); await page.getByLabel('RAM 初始数据').fill('0x11223344')
    await page.getByRole('button', { name: '写入初始 RAM', exact: true }).click()
    await page.getByLabel('内存起始地址').fill(String(size - 16))
    await expect(page.getByTestId(`memory-${size - 4}`).locator('small')).toHaveText('44 33 22 11')
    ramMetrics.push({ capacityBytes: size, resizeAndManualEditMs: Date.now() - editStart })
  }
  await page.locator('.memory-panel .hex-panel > summary').click()
  await page.getByLabel('RAM HEX 文件', { exact: true }).setInputFiles({ name: 'large-ram.hex', mimeType: 'text/plain', buffer: Buffer.from('v2.0 raw\n16*00000000 00000011 65518*00000000 11223344') })
  await expect(page.getByRole('button', { name: '确认导入 RAM' })).toBeEnabled({ timeout: 15000 })
  await page.getByRole('button', { name: '确认导入 RAM' }).click()
  await page.getByText('设置初始寄存器', { exact: true }).click()
  await page.getByLabel('初始寄存器编号').selectOption('1'); await page.getByLabel('寄存器初始值').fill('64'); await page.getByRole('button', { name: '写入初始值', exact: true }).click()
  await page.getByLabel('初始寄存器编号').selectOption('2'); await page.getByLabel('寄存器初始值').fill('42'); await page.getByRole('button', { name: '写入初始值', exact: true }).click()
  await rom(page, '0020a023 fe000ee3') // SW x2,0(x1); BEQ x0,x0,-4
  await page.getByLabel('执行步数预算').selectOption('1000')
  const runStart = Date.now()
  await page.getByRole('button', { name: '快速运行', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: '本次执行预算 1000' })).toBeVisible({ timeout: 15000 })
  await writeFile('.local/sprint031-ram-performance.json', JSON.stringify({ ramMetrics, storeBranch1000StepsMs: Date.now() - runStart, retainedTraceCount: await page.getByLabel('执行记录').locator('option').count() }, null, 2))
  await page.getByLabel('内存数据视图').selectOption('runtime'); await page.getByLabel('内存起始地址').fill('64')
  await expect(page.getByTestId('memory-64').locator('code')).toHaveText('42')
  await page.getByLabel('内存数据视图').selectOption('initial')
  await expect(page.getByTestId('memory-64').locator('code')).toHaveText('17')
  await expect(page.getByRole('button', { name: '写入初始 RAM', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '复位 CPU' }).click(); await saved(page)
  await page.reload(); await page.getByRole('button', { name: '进入芯片' }).click()
  await page.getByLabel('内存数据视图').selectOption('initial')
  await expect(page.getByLabel('RAM 容量')).toHaveValue('262144')
  await expect(page.getByTestId('memory-64').locator('code')).toHaveText('17')
  await page.getByLabel('内存起始地址').fill('262128'); await expect(page.getByTestId('memory-262140').locator('small')).toHaveText('44 33 22 11')
  await page.getByLabel('执行步数预算').selectOption('1000000')
  await page.getByRole('button', { name: '快速运行', exact: true }).click()
  await page.getByRole('button', { name: '暂停', exact: true }).click()
  const pc = await page.getByTestId('pc').textContent(), retired = await page.locator('.pc-state small').textContent()
  await page.waitForTimeout(200)
  await expect(page.getByTestId('pc')).toHaveText(pc!); await expect(page.locator('.pc-state small')).toHaveText(retired!)
})

for (const failure of ['unavailable', 'quota'] as const) test(`IndexedDB ${failure} displays failure and still allows JSON backup`, async ({ page }) => {
  await page.addInitScript(kind => {
    if (kind === 'unavailable') Object.defineProperty(window, 'indexedDB', { value: undefined })
    else {
      const put = IDBObjectStore.prototype.put
      IDBObjectStore.prototype.put = function (...args) { if (this.name === 'projects') throw new DOMException('QuotaExceededError', 'QuotaExceededError'); return Reflect.apply(put, this, args) }
    }
  }, failure)
  await openLab(page); await page.getByRole('button', { name: '新建项目', exact: true }).click()
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'error')
  await expect(page.locator('.project-controls').getByRole('alert')).toContainText(failure === 'quota' ? 'QuotaExceededError' : 'IndexedDB')
  await page.getByText('项目 JSON 备份', { exact: true }).click()
  const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: '导出完整项目 JSON' }).click()
  expect((await downloaded).suggestedFilename()).toMatch(/\.json$/)
})

test('cross-tab stale writes are rejected without overwriting the latest saved project', async ({ page, context }) => {
  await openLab(page); await page.getByRole('button', { name: '新建项目', exact: true }).click(); await rename(page, '原始项目')
  const other = await context.newPage(); await openLab(other)
  await rename(page, '最新项目')
  await other.bringToFront()
  await other.getByRole('button', { name: '重命名', exact: true }).click(); await other.getByLabel('项目名称').fill('旧标签修改')
  await other.getByRole('button', { name: '保存名称', exact: true }).click()
  await expect(other.getByTestId('save-status')).toHaveAttribute('data-status', 'error')
  await expect(other.locator('.project-controls').getByRole('alert')).toContainText('其他标签页')
  await page.reload(); await page.getByRole('button', { name: '进入芯片' }).click()
  await expect(page.getByLabel('教学程序').locator('option:checked')).toHaveText('最新项目')
})
