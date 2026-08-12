import { serializeExport, type ExportFormat } from "./json-exports"
import { buildContractBundle } from "./json-schema-contracts"
import { parseJson, type FlatRow } from "./json-lens"

export type ExportWorkerRequest = {
  id: number
  columns: string[]
  format: ExportFormat
  indentationWidth: number
  input: string
  rows: FlatRow[]
}

export type ExportWorkerResponse =
  | { id: number; ok: true; output: string }
  | { id: number; ok: false; error: string }

self.onmessage = (event: MessageEvent<ExportWorkerRequest>) => {
  const request = event.data

  try {
    const parsed = parseJson(request.input)
    const bundle = parsed.error ? undefined : buildContractBundle(parsed.value)
    const output = serializeExport({ ...request, bundle })

    self.postMessage({ id: request.id, ok: true, output } satisfies ExportWorkerResponse)
  } catch (error) {
    self.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : "Export failed.",
    } satisfies ExportWorkerResponse)
  }
}
