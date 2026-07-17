import {
  createJsonLensProcessedDataWithConfig,
  type JsonLensProcessedData,
  type RowSourceConfig,
} from "./json-lens"

type WorkerRequest = {
  id: number
  input: string
  config: RowSourceConfig
}

export type WorkerResponse =
  | {
      id: number
      ok: true
      data: JsonLensProcessedData
    }
  | {
      id: number
      ok: false
      error: string
    }

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, input, config } = event.data

  try {
    // Worker pattern: parsing and normalization stay off the UI thread for large payloads.
    self.postMessage({
      id,
      ok: true,
      data: createJsonLensProcessedDataWithConfig(input, config),
    } satisfies WorkerResponse)
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Could not process JSON.",
    } satisfies WorkerResponse)
  }
}
