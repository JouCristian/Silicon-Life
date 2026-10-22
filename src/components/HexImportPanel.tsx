import { useMemo, useRef, useState } from 'react'
import { assembly, decode, hex } from '../core/isa'
import { exportHex, MAX_HEX_BYTES, parseHex, type CellWidth } from '../io/hex'
import { memoryCells, memoryImage, parseValue } from '../io/memoryImage'
import { validateProgram } from '../io/program'
import { useLabView } from '../stores/useLabStore'

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function HexImportPanel({ target }: { target: 'ROM' | 'RAM' }) {
  const { program, initialMemory, importProgram, setInitialMemory, cpu, running, playing } = useLabView()
  const [file, setFile] = useState<{ name: string; text: string }>()
  const [width, setWidth] = useState<CellWidth>(32)
  const [offset, setOffset] = useState('0')
  const [append, setAppend] = useState(false)
  const [message, setMessage] = useState('')
  const [readError, setReadError] = useState('')
  const [reading, setReading] = useState(false)
  const generation = useRef(0)
  const ram = target === 'RAM'
  const locked = ram && (cpu.retired !== 0 || running || playing)
  const preview = useMemo(() => {
    if (!file) return undefined
    try {
      const image = parseHex(file.text, width, ram ? 1024 / (width / 8) : 256)
      const address = ram ? parseValue(offset, 32) : 0
      const memory = ram ? memoryImage(image, address) : undefined
      if (!ram) validateProgram(append ? [...program, ...image.values] : image.values)
      return { image, memory, address, error: '' }
    } catch (e) { return { error: (e as Error).message } }
  }, [file, width, ram, offset, append, program])
  return <details className="hex-panel"><summary>{target} HEX 导入 / 导出</summary>
    <p className="field-help">{ram ? '替换初始 RAM，未指定区域清零；不会改变 ROM。执行后请先复位。' : '确认后载入自定义程序并复位；保留初始 RAM。'}文件仅在本机解析。</p>
    <label className="file-field">{target} HEX 文件<input aria-label={`${target} HEX 文件`} type="file" accept=".hex,.txt" onChange={async e => {
      const token = ++generation.current, selected = e.target.files?.[0]
      e.currentTarget.value = '' // Allow selecting the same local file again after an edit.
      setFile(undefined); setMessage(''); setReadError(''); setReading(!!selected)
      if (!selected) return
      try {
        if (selected.size > MAX_HEX_BYTES) throw new Error('HEX 文件不得超过 64 KiB')
        const text = await selected.text()
        if (token === generation.current) setFile({ name: selected.name, text })
      } catch (error) { if (token === generation.current) setReadError((error as Error).message) }
      finally { if (token === generation.current) setReading(false) }
    }} /></label>
    {ram ? <div className="editor-fields">
      <label>数据单元<select aria-label="RAM 数据宽度" value={width} onChange={e => { setWidth(Number(e.target.value) as CellWidth); setMessage('') }}><option value={8}>8-bit 字节</option><option value={32}>32-bit 字（小端）</option></select></label>
      <label>装载起始字节地址<input aria-label="RAM 装载地址" value={offset} onChange={e => { setOffset(e.target.value); setMessage('') }} /></label>
    </div> : <label className="import-strategy">装载方式<select aria-label="ROM 装载方式" value={append ? 'append' : 'replace'} onChange={e => { setAppend(e.target.value === 'append'); setMessage('') }}><option value="replace">替换程序</option><option value="append">追加到末尾</option></select></label>}
    {reading && <p role="status">正在读取文件…</p>}
    {file && <p className="field-help">文件：{file.name}</p>}
    {preview?.image && <div className="hex-preview" data-testid={`${target.toLowerCase()}-preview`}>
      <p>{preview.image.format} · {width}-bit · {preview.image.values.length} 单元</p>
      {ram && <p>单元 0 → CPU 字节地址 {hex(preview.address ?? 0)}</p>}
      <ol>{preview.image.values.slice(0, 8).map((word, i) => <li key={i}><code>{hex(word)}</code><span>{ram ? `字节 ${(preview.address ?? 0) + i * width / 8}` : `${hex((append ? program.length * 4 : 0) + i * 4)} · ${assembly(decode(word))}`}</span></li>)}</ol>
      {preview.image.values.length > 8 && <p>另有 {preview.image.values.length - 8} 单元</p>}
    </div>}
    {!ram && append && preview?.image && <p className="field-help">追加不会重写 BEQ 的相对偏移；请检查完整程序列表中的分支目标。</p>}
    {(readError || preview?.error) && <p role="alert" className="error">{readError || preview?.error}</p>}
    <div className="program-actions"><button className="button subtle" disabled={reading || locked || !preview?.image} onClick={() => {
      try {
        if (!preview?.image) return
        if (ram) setInitialMemory(preview.memory!)
        else importProgram(preview.image.values, append)
        // Consume this preview; repeated clicks must not append the same file twice.
        setFile(undefined); setMessage(`${target} 已导入`)
      } catch (e) { setMessage((e as Error).message) }
    }}>确认导入 {target}</button>
      <button className="button subtle" disabled={!ram && !program.length} onClick={() => download(ram ? 'initial-memory.hex' : 'program.hex', exportHex(ram ? memoryCells(initialMemory, width) : program, width))}>导出 {target}</button></div>
    {locked && <p className="field-help">请先复位，再配置初始 RAM。</p>}
    {message && <p className="field-help" role="status">{message}</p>}
  </details>
}
