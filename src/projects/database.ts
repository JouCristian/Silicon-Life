import { PROJECT_SCHEMA, restoreProject, projectRecord, type Project } from './model'

const DB_NAME = 'silicon-life-projects'
export interface Workspace { projects: readonly Project[]; selected: string; revision: number }
export interface Repository { load(): Promise<Workspace>; commit(projects: readonly Project[], selected: string, expectedRevision: number): Promise<number>; close(): void }

/** One atomic workspace transaction. Only changed project buffers are written. */
export async function openRepository(): Promise<Repository> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('浏览器不支持 IndexedDB，请导出项目备份')); return }
    const request = indexedDB.open(DB_NAME, PROJECT_SCHEMA)
    let blocked = false
    request.onupgradeneeded = () => {
      request.result.createObjectStore('projects', { keyPath: 'id' })
      request.result.createObjectStore('meta')
    }
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result) }
    request.onerror = () => reject(request.error)
    request.onblocked = () => { blocked = true; reject(new Error('数据库升级被其他标签页阻止，请关闭旧页面后重试')) }
  })
  db.onversionchange = () => db.close()
  let last = new Map<string, Project>()
  return {
    load: () => new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'meta'], 'readonly')
      const projects = tx.objectStore('projects').getAll(), meta = tx.objectStore('meta').get('workspace')
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('读取本地项目失败'))
      tx.oncomplete = () => {
        try {
          if (meta.result && meta.result.schemaVersion !== PROJECT_SCHEMA) throw new Error('本地项目版本不兼容，请保留数据并导出备份')
          const checked = projects.result.map(restoreProject).sort((a, b) => a.createdAt - b.createdAt)
          if (checked.length > 10) throw new Error('本地项目数量超过上限')
          last = new Map(checked.map(p => [p.id, p]))
          resolve({ projects: checked, selected: meta.result?.selected ?? 'arithmetic', revision: meta.result?.revision ?? 0 })
        } catch (e) { reject(e) }
      }
    }),
    commit: (projects, selected, expectedRevision) => new Promise((resolve, reject) => {
      const tx = db.transaction(['projects', 'meta'], 'readwrite', { durability: 'strict' })
      let failure: unknown
      tx.onerror = () => { failure ??= tx.error }
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('本地保存事务失败'))
      tx.oncomplete = () => { last = new Map(projects.map(p => [p.id, p])); resolve(expectedRevision + 1) }
      const meta = tx.objectStore('meta'), request = meta.get('workspace')
      request.onsuccess = () => {
        try {
          if ((request.result?.revision ?? 0) !== expectedRevision) throw new Error('其他标签页已更新项目；当前修改保留在页面，请导出备份后刷新')
          const objectStore = tx.objectStore('projects'), ids = new Set(projects.map(p => p.id))
          for (const id of last.keys()) if (!ids.has(id)) objectStore.delete(id)
          for (const p of projects) if (last.get(p.id) !== p) objectStore.put(projectRecord(p))
          meta.put({ schemaVersion: PROJECT_SCHEMA, selected, revision: expectedRevision + 1 }, 'workspace')
        } catch (error) { failure = error; tx.abort() }
      }
    }),
    close: () => db.close(),
  }
}
