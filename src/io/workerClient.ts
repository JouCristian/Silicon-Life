import type { CellWidth } from './hex'
import type { ProjectRecord } from '../projects/model'

export interface ParsedFile { format?: string; width?: CellWidth; values?: Uint32Array; project?: ProjectRecord; error?: string }
export function parseFileWorker(text: string, width: CellWidth, maxValues: number, kind: 'hex' | 'project', signal?: AbortSignal): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new DOMException('已取消读取', 'AbortError')) }
    if (signal?.aborted) { abort(); return }
    signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = event => { cleanup(); const result = event.data as ParsedFile; if (result.error) reject(new Error(result.error)); else resolve(result) }
    worker.onerror = () => { cleanup(); reject(new Error('文件解析线程启动失败，请重试')) }
    worker.postMessage({ text, width, maxValues, kind })
  })
}
