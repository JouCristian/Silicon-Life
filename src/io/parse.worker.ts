import { parseHex, type CellWidth } from './hex'
import { importProjectJSON, projectRecord } from '../projects/model'

self.onmessage = (event: MessageEvent<{ text: string; width: CellWidth; maxValues: number; kind: 'hex' | 'project' }>) => {
  try {
    if (event.data.kind === 'project') {
      const project = projectRecord(importProjectJSON(event.data.text))
      self.postMessage({ project }, { transfer: [project.instructionROM.buffer, project.initialRAM.buffer, project.initialRegisters.buffer] })
    } else {
      const parsed = parseHex(event.data.text, event.data.width, event.data.maxValues), values = Uint32Array.from(parsed.values)
      self.postMessage({ format: parsed.format, width: parsed.width, byteOrder: parsed.byteOrder, values }, { transfer: [values.buffer] })
    }
  } catch (error) { self.postMessage({ error: (error as Error).message }) }
}
