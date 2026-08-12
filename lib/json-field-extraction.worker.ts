import {
  extractObjectsContainingKey,
  extractFieldValueGroups,
  extractJsonPathValues,
  filterObjectsByPredicate,
  limitExtractedGroups,
  type ExtractedFieldGroup,
  type FieldExtractionLimit,
  type FieldExtractionMode,
} from "./json-field-extraction"
import { parseJson } from "./json-lens"

type FieldExtractionRequest = {
  limit?: FieldExtractionLimit
  mode: FieldExtractionMode
  query: string
  input: string
  requestId: number
}

export type SerializedFieldGroup = Omit<ExtractedFieldGroup, "items" | "values"> & {
  count: number
  items: {
    json: string
    path: string
  }[]
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
  const { limit = "all", mode, query, input, requestId } = event.data

  try {
    // Worker boundary keeps parsing, traversal, and serialization away from the UI thread.
    const parsed = parseJson(input)
    if (parsed.error) {
      self.postMessage({ ok: false, error: parsed.error, requestId } satisfies FieldExtractionResponse)
      return
    }

    const extracted = limitExtractedGroups(
      runExtractionMode(mode, parsed.value, query),
      limit
    )
    const groups = extracted.map(({ items, path, values }) => ({
      path,
      items: items.map((item) => ({
        path: item.path,
        json: JSON.stringify(item.value, null, 2),
      })),
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

function runExtractionMode(
  mode: FieldExtractionMode,
  value: unknown,
  query: string
) {
  if (mode === "path") return extractJsonPathValues(value, query)
  if (mode === "contains-key") return extractObjectsContainingKey(value, query)
  if (mode === "predicate") return filterObjectsByPredicate(value, query)
  return extractFieldValueGroups(value, query)
}

function indentJson(json: string, spaces: number) {
  const indentation = " ".repeat(spaces)
  return json.replace(/\n/g, `\n${indentation}`)
}
