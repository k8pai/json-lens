import {
  extractFieldValueGroups,
  extractJsonPathValues,
  type ExtractedFieldGroup,
  type FieldExtractionMode,
} from "./json-field-extraction"
import { parseJson } from "./json-lens"

type FieldExtractionRequest = {
  mode: FieldExtractionMode
  query: string
  input: string
  requestId: number
}

export type SerializedFieldGroup = Omit<ExtractedFieldGroup, "values"> & {
  count: number
  json: string
}

export type FieldExtractionResponse =
  | {
      ok: true
      combinedJson: string
      groups: SerializedFieldGroup[]
      requestId: number
      totalMatches: number
    }
  | {
      ok: false
      error: string
      requestId: number
    }

self.onmessage = (event: MessageEvent<FieldExtractionRequest>) => {
  const { mode, query, input, requestId } = event.data

  try {
    // Worker boundary keeps parsing, traversal, and serialization away from the UI thread.
    const parsed = parseJson(input)
    if (parsed.error) {
      self.postMessage({ ok: false, error: parsed.error, requestId } satisfies FieldExtractionResponse)
      return
    }

    const extracted =
      mode === "path"
        ? extractJsonPathValues(parsed.value, query)
        : extractFieldValueGroups(parsed.value, query)
    const groups = extracted.map(({ path, values }) => ({
      path,
      count: values.length,
      json: JSON.stringify(values, null, 2),
    }))
    const combinedJson =
      groups.length === 1
        ? groups[0].json
        : `[\n${groups
            .map(
              (group) =>
                `  {\n    "path": ${JSON.stringify(group.path)},\n    "values": ${indentJson(group.json, 4)}\n  }`
            )
            .join(",\n")}\n]`

    self.postMessage({
      ok: true,
      combinedJson,
      groups,
      requestId,
      totalMatches: groups.reduce((total, group) => total + group.count, 0),
    } satisfies FieldExtractionResponse)
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Could not extract field values.",
      requestId,
    } satisfies FieldExtractionResponse)
  }
}

function indentJson(json: string, spaces: number) {
  const indentation = " ".repeat(spaces)
  return json.replace(/\n/g, `\n${indentation}`)
}
