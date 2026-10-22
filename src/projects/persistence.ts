import { useLabStore } from '../stores/useLabStore'
import { openRepository } from './database'
import { SaveQueue } from './saveQueue'

let started = false
export async function startProjectPersistence() {
  if (started) return
  started = true
  useLabStore.setState({ storageReady: false, saveStatus: 'loading' })
  try {
    const repository = await openRepository(), restored = await repository.load()
    const selected = restored.projects.some(p => p.id === restored.selected) || ['arithmetic', 'memory', 'branch'].includes(restored.selected) ? restored.selected : 'arithmetic'
    useLabStore.setState({ projects: restored.projects, storageReady: true })
    useLabStore.getState().loadProgram(selected)
    useLabStore.setState({ saveStatus: 'saved', saveError: '' })
    const queue = new SaveQueue(repository, restored.revision, (saveStatus, saveError = '') => useLabStore.setState({ saveStatus, saveError }))
    useLabStore.subscribe((s, previous) => {
      if (s.projects !== previous.projects || s.activeProjectId !== previous.activeProjectId) queue.request(s.projects, s.activeProjectId)
    })
  } catch (error) {
    // Existing database is never cleared or rewritten after a failed restore.
    useLabStore.setState({ storageReady: true, saveStatus: 'error', saveError: `${error instanceof Error ? error.message : String(error)}；本页修改尚未保存，请导出备份` })
  }
  window.addEventListener('beforeunload', event => {
    const s = useLabStore.getState()
    if (s.saveStatus === 'saving' || s.saveStatus === 'error' && s.projects.length > 0) { event.preventDefault(); event.returnValue = '' }
  })
}
