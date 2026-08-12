import {
  validateAndRepairJson,
  type JsonValidationReport,
} from "./json-validation"

type JsonValidationRequest = {
  input: string
  requestId: number
}

export type JsonValidationResponse =
  | {
      ok: true
      report: JsonValidationReport
      requestId: number
    }
  | {
      ok: false
      error: string
      requestId: number
    }

self.onmessage = (event: MessageEvent<JsonValidationRequest>) => {
  const { input, requestId } = event.data

  try {
    // Worker boundary keeps lexical diagnostics and repair generation off the UI thread.
    self.postMessage({
      ok: true,
      report: validateAndRepairJson(input),
      requestId,
    } satisfies JsonValidationResponse)
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Could not validate JSON.",
      requestId,
    } satisfies JsonValidationResponse)
  }
}
