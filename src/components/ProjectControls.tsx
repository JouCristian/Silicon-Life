import { useEffect, useRef, useState } from 'react'
import { useLabView } from '../stores/useLabStore'
import { PROGRAMS } from '../data/programs'
import { exportProjectJSON, MAX_PROJECT_JSON_BYTES, restoreProject } from '../projects/model'
import { downloadText } from '../io/download'
import { parseFileWorker } from '../io/workerClient'
import { HexFilePicker } from './HexFilePicker'
import { GlideSelect } from './GlideSelect'

export function ProjectControls() {
  const { projects, activeProjectId, programId, loadProgram, createProject, renameProject, deleteProject,
    importProject, storageReady, saveStatus, saveError } = useLabView()
  const current = projects.find(p => p.id === activeProjectId)
  const [rename, setRename] = useState(false), [name, setName] = useState('')
  const [error, setError] = useState(''), [fileName, setFileName] = useState(''), [reading, setReading] = useState(false)
  const controller = useRef<AbortController | undefined>(undefined)
  useEffect(() => { setRename(false); setError(''); setReading(false); setFileName(''); return () => controller.current?.abort() }, [activeProjectId])
  useEffect(() => () => controller.current?.abort(), [])
  const act = (action: () => void) => { try { action(); setError('') } catch (e) { setError((e as Error).message) } }
  return <section className="project-controls">
    <div className="section-title"><h2>当前项目</h2><span>{projects.length} / 10</span></div>
    <GlideSelect
      ariaLabel="教学程序"
      value={activeProjectId}
      disabled={!storageReady}
      onChange={value => act(() => loadProgram(value))}
      menuWidth={280}
      options={[
        ...PROGRAMS.map(program => ({ value: program.id, label: program.name, group: '内置示例 · 只读' })),
        ...projects.map(project => ({ value: project.id, label: project.name, group: '我的项目' })),
      ]}
    />
    <div className="project-save" role="status" data-testid="save-status" data-status={saveStatus}>
      {saveStatus === 'loading' ? '正在恢复项目…' : saveStatus === 'saving' ? '正在保存…' : saveStatus === 'saved' ? '已保存到本机' : saveStatus === 'error' ? '保存失败' : '尚未保存'}
    </div>
    {saveError && <p className="error" role="alert">{saveError}</p>}
    <div className="project-actions">
      <button className="button subtle" disabled={!storageReady || projects.length >= 10} onClick={() => act(() => createProject())}>新建项目</button>
      <button className="button subtle" disabled={!storageReady || projects.length >= 10} onClick={() => act(() => createProject(undefined, true))}>{programId === 'custom' ? '复制项目' : '复制为我的项目'}</button>
      <button className="button subtle" disabled={!current} onClick={() => { setName(current!.name); setRename(true) }}>重命名</button>
      <button className="button subtle" disabled={!current} onClick={() => { if (window.confirm(`删除项目「${current!.name}」？此操作不能撤销，请先导出备份。`)) act(deleteProject) }}>删除项目</button>
    </div>
    {projects.length === 10 && <p className="field-help">已达到 10 个项目上限，请先导出并删除不需要的项目。</p>}
    {rename && <form className="project-rename" onSubmit={e => { e.preventDefault(); act(() => { renameProject(name); setRename(false) }) }}>
      <input aria-label="项目名称" autoFocus value={name} maxLength={64} onChange={e => setName(e.target.value)} />
      <button className="button subtle">保存名称</button><button className="text-button" type="button" onClick={() => setRename(false)}>取消</button>
    </form>}
    <details className="project-backup"><summary>项目 JSON 备份</summary>
      <button className="button subtle full" disabled={!current} onClick={() => current && downloadText(`${current.name.replace(/[\\/:*?"<>|]/g, '_')}.json`, exportProjectJSON(current))}>导出完整项目 JSON</button>
      <HexFilePicker label="项目 JSON 文件" name={fileName} accept=".json" disabled={!storageReady || projects.length >= 10} onFile={async file => {
        controller.current?.abort(); const abort = new AbortController(); controller.current = abort
        setFileName(file?.name ?? ''); setError(''); setReading(!!file)
        if (!file) return
        try {
          if (file.size > MAX_PROJECT_JSON_BYTES) throw new Error('项目 JSON 不得超过 4 MiB')
          const text = await file.text(); if (abort.signal.aborted) return
          const result = await parseFileWorker(text, 32, 65536, 'project', abort.signal)
          if (!abort.signal.aborted) importProject(restoreProject(result.project))
        } catch (e) { if (!abort.signal.aborted) setError((e as Error).message) }
        finally { if (!abort.signal.aborted) setReading(false) }
      }} />
      {reading && <p role="status" className="field-help">正在解析项目…</p>}
    </details>
    <details className="local-storage-help"><summary>本地保存说明</summary><p className="field-help">仅保存项目配置，不保存运行状态和 Trace。浏览器本地保存不等于云同步；不同设备或域名不会同步，清理网站数据会删除项目。请定期导出 JSON 备份，关闭前确认「已保存到本机」。</p></details>
    {error && <p className="error" role="alert">{error}</p>}
  </section>
}
