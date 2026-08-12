import { isRecord, parseJson, stringifyPretty } from "./json-lens"

export type JsonDiffKind =
  | "left-only"
  | "right-only"
  | "changed"
  | "type"
  | "null"
  | "array-count"

export type JsonValueType =
  | "array"
  | "boolean"
  | "missing"
  | "null"
  | "number"
  | "object"
  | "string"

export type JsonDiffRow = {
  id: string
  kind: JsonDiffKind
  path: string
  pointer: string
  leftValue: string
  rightValue: string
  leftType: JsonValueType
  rightType: JsonValueType
}

export type JsonPatchOperation =
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: unknown }

export type DiffOptions = {
  identityKey?: string
}

export type MergeConflict = {
  path: string
  localValue: string
  remoteValue: string
}

export function compareJsonDocuments(
  leftInput: string,
  rightInput: string,
  options: DiffOptions = {}
) {
  const left = parseJson(leftInput)
  if (left.error) return { ok: false as const, error: `Base JSON: ${left.error}`, rows: [] }

  const right = parseJson(rightInput)
  if (right.error) return { ok: false as const, error: `Comparison JSON: ${right.error}`, rows: [] }

  return {
    ok: true as const,
    error: null,
    rows: compareJsonValues(left.value, right.value, options),
    leftValue: left.value,
    rightValue: right.value,
  }
}

export function compareJsonValues(left: unknown, right: unknown, options: DiffOptions = {}) {
  const rows: JsonDiffRow[] = []

  walkJsonDiff(left, right, "$", "", rows, options)

  return rows.map((row, index) => ({ ...row, id: `${row.kind}:${row.path}:${index}` }))
}

export function generateJsonPatch(leftInput: string, rightInput: string) {
  const left = parseJson(leftInput)
  if (left.error) return { ok: false as const, error: `Base JSON: ${left.error}`, patch: [] }

  const right = parseJson(rightInput)
  if (right.error) return { ok: false as const, error: `Comparison JSON: ${right.error}`, patch: [] }

  const patch: JsonPatchOperation[] = []
  walkJsonPatch(left.value, right.value, "", patch)

  return { ok: true as const, error: null, patch }
}

export function applyJsonPatchText(input: string, patchText: string, indentationWidth = 2) {
  const parsed = parseJson(input)
  if (parsed.error) {
    return { ok: false as const, error: `Target JSON: ${parsed.error}`, output: input, affectedPaths: [] }
  }

  let operations: JsonPatchOperation[]
  try {
    operations = JSON.parse(patchText) as JsonPatchOperation[]
  } catch {
    return { ok: false as const, error: "Patch must be a JSON array.", output: input, affectedPaths: [] }
  }

  if (!Array.isArray(operations)) {
    return { ok: false as const, error: "Patch must be a JSON array.", output: input, affectedPaths: [] }
  }

  const value = cloneJson(parsed.value)
  const affectedPaths: string[] = []

  try {
    for (const operation of operations) {
      applyJsonPatchOperation(value, operation)
      affectedPaths.push(pointerToDisplayPath(operation.path))
    }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Patch failed.",
      output: input,
      affectedPaths,
    }
  }

  return {
    ok: true as const,
    error: null,
    output: stringifyPretty(value, indentationWidth),
    affectedPaths,
  }
}

export function threeWayMergeJson(
  baseInput: string,
  localInput: string,
  remoteInput: string,
  indentationWidth = 2
) {
  const base = parseJson(baseInput)
  if (base.error) return { ok: false as const, error: `Base JSON: ${base.error}`, output: "", conflicts: [] }

  const local = parseJson(localInput)
  if (local.error) return { ok: false as const, error: `Local JSON: ${local.error}`, output: "", conflicts: [] }

  const remote = parseJson(remoteInput)
  if (remote.error) return { ok: false as const, error: `Remote JSON: ${remote.error}`, output: "", conflicts: [] }

  const localChanges = collectLeafChanges(base.value, local.value)
  const remoteChanges = collectLeafChanges(base.value, remote.value)
  const merged = cloneJson(base.value)
  const conflicts: MergeConflict[] = []

  for (const change of localChanges) {
    applyChange(merged, change)
  }

  for (const remoteChange of remoteChanges) {
    const localChange = localChanges.find((item) => item.path === remoteChange.path)

    if (localChange && JSON.stringify(localChange.value) !== JSON.stringify(remoteChange.value)) {
      conflicts.push({
        path: remoteChange.path,
        localValue: formatDiffValue(localChange.value),
        remoteValue: formatDiffValue(remoteChange.value),
      })
      continue
    }

    applyChange(merged, remoteChange)
  }

  return {
    ok: true as const,
    error: null,
    output: stringifyPretty(merged, indentationWidth),
    conflicts,
  }
}

function walkJsonDiff(
  left: unknown,
  right: unknown,
  path: string,
  pointer: string,
  rows: JsonDiffRow[],
  options: DiffOptions
) {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      rows.push(
        createDiffRow({
          kind: "array-count",
          path,
          pointer,
          left,
          right,
          leftValue: formatArrayCount(left.length),
          rightValue: formatArrayCount(right.length),
        })
      )
    }

    if (options.identityKey && canCompareByIdentity(left, right, options.identityKey)) {
      walkIdentityArrayDiff(left, right, path, pointer, rows, options.identityKey, options)
      return
    }

    const maxLength = Math.max(left.length, right.length)
    const minLength = Math.min(left.length, right.length)

    for (let index = 0; index < minLength; index += 1) {
      walkJsonDiff(left[index], right[index], `${path}[${index}]`, `${pointer}/${index}`, rows, options)
    }

    for (let index = minLength; index < maxLength; index += 1) {
      if (index >= left.length) {
        rows.push(createDiffRow({
          kind: "right-only",
          path: `${path}[${index}]`,
          pointer: `${pointer}/${index}`,
          leftType: "missing",
          leftValue: "missing",
          right: right[index],
        }))
      } else {
        rows.push(createDiffRow({
          kind: "left-only",
          path: `${path}[${index}]`,
          pointer: `${pointer}/${index}`,
          left: left[index],
          rightType: "missing",
          rightValue: "missing",
        }))
      }
    }

    return
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])

    for (const key of keys) {
      const childPath = appendDisplayPath(path, key)
      const childPointer = `${pointer}/${escapePointerToken(key)}`
      const hasLeft = Object.prototype.hasOwnProperty.call(left, key)
      const hasRight = Object.prototype.hasOwnProperty.call(right, key)

      if (!hasLeft) {
        rows.push(createDiffRow({
          kind: "right-only",
          path: childPath,
          pointer: childPointer,
          leftType: "missing",
          leftValue: "missing",
          right: right[key],
        }))
      } else if (!hasRight) {
        rows.push(createDiffRow({
          kind: "left-only",
          path: childPath,
          pointer: childPointer,
          left: left[key],
          rightType: "missing",
          rightValue: "missing",
        }))
      } else {
        walkJsonDiff(left[key], right[key], childPath, childPointer, rows, options)
      }
    }

    return
  }

  const leftType = getJsonValueType(left)
  const rightType = getJsonValueType(right)

  if (leftType !== rightType) {
    rows.push(createDiffRow({
      kind: leftType === "null" || rightType === "null" ? "null" : "type",
      path,
      pointer,
      left,
      right,
    }))
    return
  }

  if (!Object.is(left, right)) {
    rows.push(createDiffRow({ kind: "changed", path, pointer, left, right }))
  }
}

function walkIdentityArrayDiff(
  left: unknown[],
  right: unknown[],
  path: string,
  pointer: string,
  rows: JsonDiffRow[],
  identityKey: string,
  options: DiffOptions
) {
  const leftMap = new Map(left.map((item) => [String((item as Record<string, unknown>)[identityKey]), item]))
  const rightMap = new Map(right.map((item) => [String((item as Record<string, unknown>)[identityKey]), item]))
  const ids = new Set([...leftMap.keys(), ...rightMap.keys()])

  for (const id of ids) {
    const childPath = `${path}[${identityKey}=${JSON.stringify(id)}]`
    const leftValue = leftMap.get(id)
    const rightValue = rightMap.get(id)

    if (leftValue === undefined) {
      rows.push(createDiffRow({
        kind: "right-only",
        path: childPath,
        pointer,
        leftType: "missing",
        leftValue: "missing",
        right: rightValue,
      }))
    } else if (rightValue === undefined) {
      rows.push(createDiffRow({
        kind: "left-only",
        path: childPath,
        pointer,
        left: leftValue,
        rightType: "missing",
        rightValue: "missing",
      }))
    } else {
      walkJsonDiff(leftValue, rightValue, childPath, pointer, rows, options)
    }
  }
}

function walkJsonPatch(left: unknown, right: unknown, pointer: string, patch: JsonPatchOperation[]) {
  if (isRecord(left) && isRecord(right)) {
    for (const key of Object.keys(left)) {
      if (!Object.prototype.hasOwnProperty.call(right, key)) {
        patch.push({ op: "remove", path: `${pointer}/${escapePointerToken(key)}` })
      }
    }

    for (const key of Object.keys(right)) {
      const childPointer = `${pointer}/${escapePointerToken(key)}`
      if (!Object.prototype.hasOwnProperty.call(left, key)) {
        patch.push({ op: "add", path: childPointer, value: right[key] })
      } else {
        walkJsonPatch(left[key], right[key], childPointer, patch)
      }
    }

    return
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      patch.push({ op: "replace", path: pointer || "", value: right })
    }
    return
  }

  if (JSON.stringify(left) !== JSON.stringify(right)) {
    patch.push({ op: pointer ? "replace" : "replace", path: pointer || "", value: right })
  }
}

function applyJsonPatchOperation(value: unknown, operation: JsonPatchOperation) {
  if (!operation || typeof operation.path !== "string") {
    throw new Error("Invalid patch operation.")
  }

  if (operation.path === "") {
    throw new Error("Root-level replacement is not supported in the interactive patch applier.")
  }

  const tokens = parsePointer(operation.path)
  const parent = getPointerParent(value, tokens)
  const last = tokens[tokens.length - 1]

  if (operation.op === "remove") {
    if (Array.isArray(parent)) parent.splice(Number(last), 1)
    else if (isRecord(parent)) delete parent[last]
    else throw new Error(`Cannot remove ${operation.path}.`)
    return
  }

  if (operation.op !== "add" && operation.op !== "replace") {
    throw new Error(`Unsupported patch operation: ${(operation as { op?: string }).op}`)
  }

  if (Array.isArray(parent)) parent[Number(last)] = operation.value
  else if (isRecord(parent)) parent[last] = operation.value
  else throw new Error(`Cannot write ${operation.path}.`)
}

function collectLeafChanges(base: unknown, next: unknown) {
  const rows = compareJsonValues(base, next)

  return rows.map((row) => ({
    path: row.path,
    pointer: row.pointer,
    kind: row.kind,
    value: row.kind === "left-only" ? undefined : getByPointer(next, row.pointer),
  }))
}

function applyChange(root: unknown, change: { pointer: string; kind: JsonDiffKind; value: unknown }) {
  if (change.pointer === "") return
  const tokens = parsePointer(change.pointer)
  const parent = getPointerParent(root, tokens)
  const last = tokens[tokens.length - 1]

  if (change.kind === "left-only") {
    if (Array.isArray(parent)) parent.splice(Number(last), 1)
    else if (isRecord(parent)) delete parent[last]
    return
  }

  if (Array.isArray(parent)) parent[Number(last)] = cloneJson(change.value)
  else if (isRecord(parent)) parent[last] = cloneJson(change.value)
}

function getByPointer(value: unknown, pointer: string) {
  if (!pointer) return value
  return parsePointer(pointer).reduce<unknown>((current, token) => {
    if (Array.isArray(current)) return current[Number(token)]
    if (isRecord(current)) return current[token]
    return undefined
  }, value)
}

function getPointerParent(value: unknown, tokens: string[]) {
  if (!tokens.length) throw new Error("Patch path cannot be empty.")

  let current = value
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(current)) current = current[Number(token)]
    else if (isRecord(current)) current = current[token]
    else throw new Error(`Cannot traverse patch path /${tokens.join("/")}.`)
  }
  return current
}

function createDiffRow({
  kind,
  path,
  pointer,
  left,
  right,
  leftType,
  rightType,
  leftValue,
  rightValue,
}: {
  kind: JsonDiffKind
  path: string
  pointer: string
  left?: unknown
  right?: unknown
  leftType?: JsonValueType
  rightType?: JsonValueType
  leftValue?: string
  rightValue?: string
}): JsonDiffRow {
  return {
    id: "",
    kind,
    path,
    pointer,
    leftValue: leftValue ?? formatDiffValue(left),
    rightValue: rightValue ?? formatDiffValue(right),
    leftType: leftType ?? getJsonValueType(left),
    rightType: rightType ?? getJsonValueType(right),
  }
}

function canCompareByIdentity(left: unknown[], right: unknown[], identityKey: string) {
  const rows = [...left, ...right]

  return rows.length > 0 && rows.every((item) => {
    if (!isRecord(item)) return false
    const id = item[identityKey]
    return typeof id === "string" || typeof id === "number"
  })
}

export function countDiffKinds(rows: JsonDiffRow[]) {
  const counts = {
    "left-only": 0,
    "right-only": 0,
    changed: 0,
    type: 0,
    null: 0,
    "array-count": 0,
  } satisfies Record<JsonDiffKind, number>

  for (const row of rows) counts[row.kind] += 1
  return counts
}

export function getDiffKindLabel(kind: JsonDiffKind) {
  const labels: Record<JsonDiffKind, string> = {
    "left-only": "Removed",
    "right-only": "Added",
    changed: "Changed",
    type: "Type",
    null: "Null",
    "array-count": "Array count",
  }

  return labels[kind]
}

function getJsonValueType(value: unknown): JsonValueType {
  if (Array.isArray(value)) return "array"
  if (value === null) return "null"
  if (isRecord(value)) return "object"
  if (value === undefined) return "missing"

  const type = typeof value
  if (type === "boolean") return "boolean"
  if (type === "number") return "number"
  if (type === "string") return "string"
  return "string"
}

function formatArrayCount(length: number) {
  return `${length.toLocaleString()} ${length === 1 ? "item" : "items"}`
}

function formatDiffValue(value: unknown) {
  if (Array.isArray(value)) return formatArrayCount(value.length)
  if (isRecord(value)) {
    const keyCount = Object.keys(value).length
    return `${keyCount.toLocaleString()} ${keyCount === 1 ? "key" : "keys"}`
  }

  const text = JSON.stringify(value)
  if (!text) return String(value)
  return text.length > 120 ? `${text.slice(0, 117)}...` : text
}

function appendDisplayPath(path: string, key: string) {
  const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? key
    : `[${JSON.stringify(key)}]`

  if (path === "$") return segment.startsWith("[") ? `${path}${segment}` : `${path}.${segment}`
  return segment.startsWith("[") ? `${path}${segment}` : `${path}.${segment}`
}

function parsePointer(pointer: string) {
  if (!pointer) return []
  if (!pointer.startsWith("/")) throw new Error(`Invalid JSON pointer: ${pointer}`)

  return pointer
    .slice(1)
    .split("/")
    .map((token) => token.replaceAll("~1", "/").replaceAll("~0", "~"))
}

function pointerToDisplayPath(pointer: string) {
  if (!pointer) return "$"

  return parsePointer(pointer).reduce((path, token) => {
    if (/^\d+$/.test(token)) return `${path}[${token}]`
    return appendDisplayPath(path, token)
  }, "$")
}

function escapePointerToken(token: string) {
  return token.replaceAll("~", "~0").replaceAll("/", "~1")
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}
