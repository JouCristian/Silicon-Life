import { useId, useRef } from 'react'

export function HexFilePicker({ label, name, onFile, accept = '.hex,.txt', disabled = false }: {
  label: string; name: string; onFile: (file?: File) => void; accept?: string; disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null), id = useId()
  return <div className="hex-file-picker">
    <input id={id} ref={input} className="file-input" type="file" tabIndex={-1} accept={accept} aria-label={label} disabled={disabled}
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; onFile(file) }} />
    <button className="button subtle" type="button" disabled={disabled} aria-controls={id} onClick={() => input.current?.click()}>选择{label}</button>
    <span className="picked-file-name" title={name || '未选择文件'} aria-live="polite">{name || '未选择文件'}</span>
  </div>
}
