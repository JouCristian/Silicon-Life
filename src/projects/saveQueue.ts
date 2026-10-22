import type { Project } from './model'
import type { Repository } from './database'

type Snapshot = { projects: readonly Project[]; selected: string }
/** Serial, coalescing queue. A stale completion never acknowledges newer edits. */
export class SaveQueue {
  #pending?: Snapshot
  #writing = false
  #failed = false
  constructor(private repository: Repository, private revision: number,
    private status: (status: 'saving' | 'saved' | 'error', error?: string) => void) {}
  request(projects: readonly Project[], selected: string) {
    this.#pending = { projects, selected }
    if (!this.#failed) { this.status('saving'); void this.flush() }
  }
  async flush() {
    if (this.#writing || this.#failed) return
    this.#writing = true
    try {
      // Let multiple synchronous actions coalesce, without a debounce window.
      await Promise.resolve()
      while (this.#pending) {
        const snapshot = this.#pending; this.#pending = undefined
        try { this.revision = await this.repository.commit(snapshot.projects, snapshot.selected, this.revision) }
        catch (error) { this.#pending ??= snapshot; throw error }
      }
      this.status('saved')
    } catch (error) {
      this.#failed = true
      this.status('error', `${error instanceof Error ? error.message : String(error)}；请导出项目备份`)
    } finally { this.#writing = false; if (this.#pending && !this.#failed) void this.flush() }
  }
}
