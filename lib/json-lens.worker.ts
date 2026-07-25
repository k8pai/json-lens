import {
  createJsonLensProcessedDataWithConfig,
  type JsonLensProcessedData,
  type ProcessingUpdate,
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
      progress: ProcessingUpdate
      type: "progress"
    }
  | {
      id: number
      ok: true
      data: JsonLensProcessedData
      type: "result"
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
      data: createJsonLensProcessedDataWithConfig(input, config, (progress) => {
        self.postMessage({
          id,
          ok: true,
          progress,
          type: "progress",
        } satisfies WorkerResponse)
      }),
      type: "result",
    } satisfies WorkerResponse)
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Could not process JSON.",
    } satisfies WorkerResponse)
  }
}
