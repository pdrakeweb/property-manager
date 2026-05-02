import { test, expect, Page } from '@playwright/test'

const PROP_ID = 'tannerville'
const ROOT_FOLDER = '14CifGAre0egOHO0qVdrVBXCQY0WXk6Wt'

async function waitFor<T>(page: Page, fn: () => T | null, timeout = 6000, interval = 200): Promise<T | null> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await page.evaluate(fn)
    if (result) return result as T
    await page.waitForTimeout(interval)
  }
  return null
}

test('Drive sync round-trip: push pending → wipe → pull restores records', async ({ page }) => {
  const taskId = 'sync_test_task_001'
  const equipId = 'sync_test_equip_001'
  const taskTitle = 'Sync Test – HVAC Filter Replace'
  const equipTitle = 'Sync Test – Carrier Furnace 96'
  const dueDate = '2026-06-01'
  const taskFilename = `task_${taskId}.json`
  const equipFilename = `equipment_${equipId}.json`

  // ── Phase 1: Authenticate ────────────────────────────────────────────────
  await page.goto('/#/')
  await page.waitForTimeout(800)

  await page.evaluate(() => {
    localStorage.setItem('google_access_token', 'dev_token')
    localStorage.setItem('google_user_email', 'dev@local')
  })

  // ── Phase 2: Inject pending records ─────────────────────────────────────
  await page.evaluate(
    ({ taskId, equipId, taskTitle, equipTitle, dueDate, taskFilename, equipFilename, PROP_ID, ROOT_FOLDER }) => {
      const now = new Date().toISOString()
      const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')

      idx[taskId] = {
        id: taskId,
        type: 'task',
        categoryId: 'hvac',
        propertyId: PROP_ID,
        title: taskTitle,
        data: {
          id: taskId,
          propertyId: PROP_ID,
          title: taskTitle,
          systemLabel: 'HVAC',
          categoryId: 'hvac',
          dueDate,
          priority: 'medium',
          status: 'upcoming',
          source: 'manual',
          filename: taskFilename,
          rootFolderId: ROOT_FOLDER,
        },
        syncState: 'pending_upload',
        localUpdatedAt: now,
      }

      idx[equipId] = {
        id: equipId,
        type: 'equipment',
        categoryId: 'hvac',
        propertyId: PROP_ID,
        title: equipTitle,
        data: {
          id: equipId,
          propertyId: PROP_ID,
          label: equipTitle,
          categoryId: 'hvac',
          brand: 'Carrier',
          model: '96% AFUE Gas Furnace',
          installYear: 2019,
          filename: equipFilename,
          rootFolderId: ROOT_FOLDER,
        },
        syncState: 'pending_upload',
        localUpdatedAt: now,
      }

      localStorage.setItem('pm_index_v1', JSON.stringify(idx))
    },
    { taskId, equipId, taskTitle, equipTitle, dueDate, taskFilename, equipFilename, PROP_ID, ROOT_FOLDER },
  )

  const injected = await page.evaluate(
    ({ taskId, equipId }) => {
      const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
      return { hasTask: !!idx[taskId], hasEquip: !!idx[equipId] }
    },
    { taskId, equipId },
  )
  expect(injected.hasTask, 'Task injected into localIndex as pending_upload').toBe(true)
  expect(injected.hasEquip, 'Equipment injected into localIndex as pending_upload').toBe(true)

  // ── Phase 3: Reload → startup sync pushes pending to dev Drive ──────────
  await page.reload()

  await waitFor(
    page,
    () => {
      const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
      const pending = Object.values(idx).filter((r: any) => r.syncState === 'pending_upload')
      return pending.length === 0 ? true : null
    },
    8000,
  )

  const postPushStats = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
    return Object.values(idx).filter((r: any) => r.syncState === 'pending_upload').length
  })
  expect(postPushStats, 'All records synced (0 pending)').toBe(0)

  // ── Phase 4: Verify dev Drive has the files ──────────────────────────────
  const driveState = await page.evaluate(
    ({ taskFilename, equipFilename }) => {
      const devDrive = JSON.parse(localStorage.getItem('pm_dev_drive_v1') ?? '{}')
      const files = Object.values(devDrive).filter((e: any) => !e.isFolder) as any[]
      const taskFile = files.find((e) => e.name === taskFilename)
      const equipFile = files.find((e) => e.name === equipFilename)
      return {
        totalFiles: files.length,
        taskFileFound: !!taskFile,
        equipFileFound: !!equipFile,
        taskContent: taskFile?.content?.slice(0, 60) ?? null,
        fileNames: files.map((e) => e.name),
      }
    },
    { taskFilename, equipFilename },
  )

  expect(driveState.taskFileFound, `task file '${taskFilename}' in dev Drive`).toBe(true)
  expect(driveState.equipFileFound, `equipment file '${equipFilename}' in dev Drive`).toBe(true)

  // ── Phase 5: Wipe localIndex ─────────────────────────────────────────────
  await page.evaluate(() => localStorage.removeItem('pm_index_v1'))
  const wiped = await page.evaluate(() => localStorage.getItem('pm_index_v1') === null)
  expect(wiped, 'pm_index_v1 wiped').toBe(true)

  // ── Phase 6: Reload → startup sync seeds + pulls from Drive ─────────────
  await page.reload()

  await waitFor(
    page,
    () => {
      const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
      return Object.keys(idx).length > 0 ? true : null
    },
    6000,
  )

  await page.waitForTimeout(1500)

  const afterPull = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('pm_index_v1') ?? '{}')
    const records = Object.values(idx) as any[]
    const tasks = records.filter((r) => r.type === 'task')
    const equip = records.filter((r) => r.type === 'equipment')
    const driveRec = records.filter((r) => r.id && r.id.startsWith('drive_'))

    const restoredTask = tasks.find((r) => r.title && r.title.includes('Sync Test'))
    const restoredEquip = equip.find((r) => r.title && r.title.includes('Sync Test'))

    return {
      total: records.length,
      taskCount: tasks.length,
      equipCount: equip.length,
      driveRestoredCount: driveRec.length,
      taskRestored: !!restoredTask,
      equipRestored: !!restoredEquip,
      restoredTaskTitle: restoredTask?.title ?? null,
      restoredTaskDueDate: restoredTask?.data?.dueDate ?? null,
      restoredEquipTitle: restoredEquip?.title ?? null,
    }
  })

  expect(afterPull.taskCount, `Tasks restored in localIndex (${afterPull.taskCount})`).toBeGreaterThan(0)
  expect(afterPull.equipCount, `Equipment restored in localIndex (${afterPull.equipCount})`).toBeGreaterThan(0)
  expect(afterPull.taskRestored, "Sync test task restored as type='task'").toBe(true)
  expect(afterPull.equipRestored, "Sync test equipment restored as type='equipment' with correct title").toBe(true)
  if (afterPull.restoredTaskDueDate) {
    expect(
      afterPull.restoredTaskDueDate,
      `Task dueDate preserved correctly (${afterPull.restoredTaskDueDate})`,
    ).toBe(dueDate)
  }

  // ── Phase 7: Verify task visible in Maintenance UI ───────────────────────
  await page.goto('/#/maintenance')
  await page.waitForTimeout(1000)

  const upcomingTab = await page.$('button:has-text("Upcoming"), [role="tab"]:has-text("Upcoming")')
  if (upcomingTab) {
    await upcomingTab.click()
    await page.waitForTimeout(500)
  }

  const maintenanceContent = await page.content()
  const taskVisibleInUI =
    maintenanceContent.includes('Sync Test') || maintenanceContent.includes('HVAC Filter Replace')
  expect(taskVisibleInUI, 'Restored task title visible on Maintenance screen').toBe(true)
})
