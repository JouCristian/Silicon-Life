import { useEffect, useMemo, useRef, useState } from 'react'
import { hex } from '../core/isa'
import { InstructionROM } from '../core/rom'
import { exportHex, MAX_HEX_BYTES, type CellWidth, type HexImage } from '../io/hex'
import { memoryCells, memoryImage, parseValue } from '../io/memoryImage'
import { instructionRow, MAX_PROGRAM_WORDS, validateProgram } from '../io/program'
import { parseFileWorker } from '../io/workerClient'
import { downloadText } from '../io/download'
import { useLabView } from '../stores/useLabStore'
import { HexFilePicker } from './HexFilePicker'
import { GlideSelect } from './GlideSelect'

export function HexImportPanel({ target }: { target: 'ROM' | 'RAM' }) {
  const { program, initialMemory, importProgram, setInitialMemory, cpu, running, playing, fastRunning, storageReady } = useLabView()
  const [file, setFile] = useState<{ name: string; text: string }>(), [name, setName] = useState('')
  const [image, setImage] = useState<HexImage>(), [width, setWidth] = useState<CellWidth>(32), [offset, setOffset] = useState('0')
  const [append, setAppend] = useState(false), [strict, setStrict] = useState(false)
  const [message, setMessage] = useState(''), [readError, setReadError] = useState(''), [reading, setReading] = useState(false)
  const generation = useRef(0), controller = useRef<AbortController | undefined>(undefined)
  const ram = target === 'RAM', capacity = initialMemory.length
  const locked = !storageReady || ram && (cpu.retired !== 0 || running || playing || fastRunning)
  useEffect(() => {
    if (!file) return
    const abort = new AbortController(); controller.current?.abort(); controller.current = abort
    setImage(undefined); setReading(true); setReadError('')
    void parseFileWorker(file.text, width, ram ? capacity / (width / 8) : MAX_PROGRAM_WORDS, 'hex', abort.signal).then(result => {
      if (!abort.signal.aborted) setImage({ format: result.format!, width: result.width!, byteOrder: result.byteOrder,
        values: ram ? Object.freeze(Array.from(result.values!)) : new InstructionROM(result.values!) })
    }).catch(error => { if (!abort.signal.aborted) setReadError((error as Error).message) }).finally(() => { if (!abort.signal.aborted) setReading(false) })
    return () => abort.abort()
  }, [file, width, ram, capacity])
  useEffect(() => () => { generation.current++; controller.current?.abort() }, [])
  const preview = useMemo(() => {
    if (!image) return undefined
    try {
      const address = ram ? parseValue(offset, 32) : 0
      const memory = ram ? memoryImage(image, address, capacity) : undefined
      if (!ram) validateProgram(append ? [...program, ...image.values] : image.values, strict)
      return { image, memory, address, error: '' }
    } catch (e) { return { error: (e as Error).message } }
  }, [image, ram, offset, append, program, capacity, strict])
  return <details className="hex-panel"><summary>{target} HEX 导入 / 导出</summary>
    <HexFilePicker label={`${target} HEX 文件`} name={name} disabled={!storageReady} onFile={async selected => {
      const token = ++generation.current; controller.current?.abort()
      setFile(undefined); setImage(undefined); setMessage(''); setReadError(''); setName(selected?.name ?? ''); setReading(!!selected)
      if (!selected) return
      try {
        if (selected.size > MAX_HEX_BYTES) throw new Error('HEX 文件不得超过 4 MiB')
        const text = await selected.text()
        if (token === generation.current) setFile({ name: selected.name, text })
      } catch (error) { if (token === generation.current) { setReadError((error as Error).message); setReading(false) } }
    }} />
    {ram ? <div className="editor-fields"><label>数据单元<GlideSelect
      ariaLabel="RAM 数据宽度"
      value={String(width)}
      onChange={value => { setWidth(Number(value) as CellWidth); setMessage('') }}
      options={[{ value: '8', label: '8-bit 字节' }, { value: '32', label: '32-bit 字（小端）' }]}
      menuWidth={200}
    /></label><label>起始字节地址<input aria-label="RAM 装载地址" value={offset} onChange={e => { setOffset(e.target.value); setMessage('') }} /></label></div>
      : <><label className="import-strategy">装载方式<GlideSelect
        ariaLabel="ROM 装载方式"
        value={append ? 'append' : 'replace'}
        onChange={value => { setAppend(value === 'append'); setMessage('') }}
        options={[{ value: 'replace', label: '替换程序' }, { value: 'append', label: '追加到末尾' }]}
        menuWidth={180}
      /></label><label className="strict-import"><input type="checkbox" checked={strict} onChange={e => setStrict(e.target.checked)} />严格模式：拒绝未支持指令</label></>}
    {reading && <p role="status" className="field-help">正在解析，请稍候…</p>}
    {!ram && preview?.image && <p className="field-help">HEX 解析成功，尚未装载。确认后保留全部机器码；CPU 支持 RV32I，ECALL/EBREAK 停止，M/C/A、CSR、FENCE.I、MMIO 与操作系统未实现，完整程序可执行性需另行检查。</p>}
    {preview?.image && <div className="hex-preview" data-testid={`${target.toLowerCase()}-preview`}><p>{preview.image.format} · {width}-bit{preview.image.byteOrder ? ` · ${preview.image.byteOrder}` : ''} · {preview.image.values.length.toLocaleString()} 单元</p>{ram && <p>单元 0 → CPU 字节地址 {hex(preview.address ?? 0)}</p>}
      <ol>{preview.image.values.slice(0, 8).map((word, i) => <li key={i}><code>{hex(word)}</code><span>{ram ? `字节 ${(preview.address ?? 0) + i * width / 8}` : `${hex((append ? program.length * 4 : 0) + i * 4)} · ${instructionRow(preview.image.values, i).assembly}`}</span></li>)}</ol>
      {preview.image.values.length > 8 && <p>另有 {(preview.image.values.length - 8).toLocaleString()} 单元</p>}</div>}
    {(readError || preview?.error) && <p role="alert" className="error">{readError || preview?.error}</p>}
    <div className="program-actions"><button className="button subtle" disabled={reading || locked || !preview?.image} onClick={() => {
      try {
        if (!preview?.image) return
        const count = preview.image.values.length
        if (ram) setInitialMemory(preview.memory!)
        else importProgram(preview.image.values, append, strict)
        setFile(undefined); setImage(undefined); setMessage(ram ? `初始 RAM 已更新：${count.toLocaleString()} 单元` : '')
      } catch (e) { setReadError((e as Error).message) }
    }}>确认导入 {target}</button><button className="button subtle" disabled={!ram && !program.length} onClick={() => downloadText(ram ? 'initial-memory.hex' : 'program.hex', exportHex(ram ? memoryCells(initialMemory, width) : program, width))}>导出 {target}</button></div>
    {locked && ram && <p className="field-help">请先复位 CPU，再更新初始 RAM；运行 RAM 将从初始配置重新开始。</p>}
    {message && <p className="field-help" role="status">{message}</p>}
    <details className="format-help"><summary>格式与导入说明</summary><p className="field-help">支持 v2.0 raw、纯十六进制、v3.0 hex words/bytes plain/addressed，最大 4 MiB。words 地址按所选数据单元计数；bytes 地址按字节计数，默认 big-endian，可声明 little-endian。文件先转换为所选单元，再按 CPU 小端装载；空洞补零，末尾不足一个单元的完整字节补零，同一地址后写覆盖前写。addressed 行中双空白后的 ASCII 列忽略。{ram ? '起始地址按 CPU 字节计算；确认后替换初始 RAM，未指定区域清零。' : '确认后复位执行，保留本项目的初始 RAM 和寄存器。原始未支持机器码可以保存，运行到该处会停止；追加不重写 BEQ 偏移。'}</p></details>
  </details>
}
