import {
  compareValues,
  flattenValue,
  isRecord,
  parseJson,
  stringifyPretty,
} from "./json-lens"

export type TransformResult = {
  ok: boolean
  output: string
  summary: string
  affectedPaths: string[]
}

export type TransformOperation =
  | "rename-key"
  | "bulk-rename"
  | "remove"
  | "keep-only"
  | "move"
  | "flatten"
  | "unflatten"
  | "explode-array"
  | "group-rows"
  | "object-map-to-array"
  | "array-to-object-map"
  | "sort-keys"
  | "sort-arrays"
  | "dedupe-arrays"
  | "trim-strings"
  | "regex-replace"
  | "convert-primitives"
  | "normalize-null"
  | "normalize-dates"
  | "computed-field"
  | "mask-sensitive"

export type TransformConfig = {
  operation: TransformOperation
  fromKey?: string
  toKey?: string
  mappingText?: string
  selectorsText?: string
  sourcePath?: string
  targetPath?: string
  arrayPath?: string
  groupKeys?: string
  childKey?: string
  keyField?: string
  sortField?: string
  regexPattern?: string
  regexReplacement?: string
  nullTokens?: string
  computedField?: string
  computedTemplate?: string
  maskSelectors?: string
}

type MutableRecord = Record<string, unknown>

export function runJsonTransformation(
  input: string,
  config: TransformConfig,
  indentationWidth = 2
): TransformResult {
  const parsed = parseJson(input)
  if (parsed.error) {
    return fail(parsed.error, input)
  }

  const source = cloneJson(parsed.value)
  const affectedPaths: string[] = []

  try {
    const value = applyTransform(source, config, affectedPaths)

    return {
      ok: true,
      output: stringifyPretty(value, indentationWidth),
      summary: summarizeTransform(config.operation, affectedPaths),
      affectedPaths,
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Transformation failed.", input)
  }
}

function applyTransform(
  value: unknown,
  config: TransformConfig,
  affectedPaths: string[]
) {
  switch (config.operation) {
    case "rename-key":
      return renameKeys(value, [[required(config.fromKey, "Source key"), required(config.toKey, "Target key")]], affectedPaths)
    case "bulk-rename":
      return renameKeys(value, parseKeyMappings(config.mappingText), affectedPaths)
    case "remove":
      return removeSelectors(value, parseSelectors(config.selectorsText), affectedPaths)
    case "keep-only":
      return keepOnlyPaths(value, parseSelectors(config.selectorsText), affectedPaths)
    case "move":
      return movePath(
        value,
        required(config.sourcePath, "Source path"),
        required(config.targetPath, "Target path"),
        affectedPaths
      )
    case "flatten":
      return flattenAny(value, affectedPaths)
    case "unflatten":
      return unflattenObject(value, affectedPaths)
    case "explode-array":
      return explodeArrayRows(value, required(config.arrayPath, "Array path"), affectedPaths)
    case "group-rows":
      return groupRows(
        value,
        parseCsv(config.groupKeys),
        config.childKey?.trim() || "items",
        affectedPaths
      )
    case "object-map-to-array":
      return objectMapToArray(value, config.keyField?.trim() || "key", affectedPaths)
    case "array-to-object-map":
      return arrayToObjectMap(value, required(config.keyField, "Identity field"), affectedPaths)
    case "sort-keys":
      affectedPaths.push("$")
      return sortJsonKeys(value)
    case "sort-arrays":
      return sortArraysByField(value, required(config.sortField, "Sort field"), affectedPaths)
    case "dedupe-arrays":
      return dedupeArrays(value, affectedPaths)
    case "trim-strings":
      return mapJsonValues(value, affectedPaths, (item, path) => {
        if (typeof item !== "string") return item
        const next = item.trim()
        if (next !== item) affectedPaths.push(path)
        return next
      })
    case "regex-replace":
      return replaceStrings(
        value,
        required(config.regexPattern, "Regex pattern"),
        config.regexReplacement ?? "",
        affectedPaths
      )
    case "convert-primitives":
      return convertPrimitiveStrings(value, affectedPaths)
    case "normalize-null":
      return normalizeNullLike(value, config.nullTokens, affectedPaths)
    case "normalize-dates":
      return normalizeDates(value, affectedPaths)
    case "computed-field":
      return addComputedField(
        value,
        required(config.computedField, "Computed field"),
        config.computedTemplate ?? "",
        affectedPaths
      )
    case "mask-sensitive":
      return maskSensitiveValues(value, config.maskSelectors, affectedPaths)
  }
}

function fail(message: string, output: string): TransformResult {
  return { ok: false, output, summary: message, affectedPaths: [] }
}

function summarizeTransform(operation: TransformOperation, affectedPaths: string[]) {
  return `${getTransformLabel(operation)} affected ${affectedPaths.length.toLocaleString()} path${affectedPaths.length === 1 ? "" : "s"}.`
}

export function getTransformLabel(operation: TransformOperation) {
  const labels: Record<TransformOperation, string> = {
    "rename-key": "Rename key",
    "bulk-rename": "Bulk rename keys",
    remove: "Remove keys or paths",
    "keep-only": "Keep only selected paths",
    move: "Move key to path",
    flatten: "Flatten object",
    unflatten: "Unflatten object",
    "explode-array": "Explode array items",
    "group-rows": "Group rows into nested arrays",
    "object-map-to-array": "Convert object map to array",
    "array-to-object-map": "Convert array to object map",
    "sort-keys": "Sort object keys",
    "sort-arrays": "Sort arrays by field",
    "dedupe-arrays": "Deduplicate array items",
    "trim-strings": "Trim string values",
    "regex-replace": "Regex replace values",
    "convert-primitives": "Convert primitive types",
    "normalize-null": "Normalize null-like values",
    "normalize-dates": "Normalize dates",
    "computed-field": "Add computed field",
    "mask-sensitive": "Mask sensitive values",
  }

  return labels[operation]
}

function renameKeys(
  value: unknown,
  mappings: Array<[string, string]>,
  affectedPaths: string[]
): unknown {
  if (!mappings.length) throw new Error("Add at least one key mapping.")
  const mapping = new Map(mappings)

  function walk(item: unknown, path: string): unknown {
    if (Array.isArray(item)) return item.map((child, index) => walk(child, `${path}[${index}]`))
    if (!isRecord(item)) return item

    const next = createSafeRecord()

    for (const [key, child] of Object.entries(item)) {
      const outputKey = mapping.get(key) ?? key
      const childPath = appendDisplayPath(path, outputKey)

      if (Object.prototype.hasOwnProperty.call(next, outputKey)) {
        throw new Error(`Rename collision at ${path}: ${outputKey}`)
      }

      if (outputKey !== key) affectedPaths.push(childPath)
      next[outputKey] = walk(child, childPath)
    }

    return next
  }

  return walk(value, "$")
}

function removeSelectors(value: unknown, selectors: string[], affectedPaths: string[]) {
  if (!selectors.length) throw new Error("Add at least one key or JSON path to remove.")
  const next = cloneJson(value)

  for (const selector of selectors) {
    if (isJsonPath(selector)) {
      if (deletePath(next, selector)) affectedPaths.push(normalizeJsonPath(selector))
    } else {
      removeKeyEverywhere(next, selector, "$", affectedPaths)
    }
  }

  return next
}

function keepOnlyPaths(value: unknown, selectors: string[], affectedPaths: string[]) {
  const paths = selectors.filter(isJsonPath)
  if (!paths.length) throw new Error("Keep-only expects JSON paths like $.user.name.")

  const target = createSafeRecord()

  for (const path of paths) {
    const found = getPath(value, path)
    if (!found.exists) continue
    setPath(target, path, cloneJson(found.value), false)
    affectedPaths.push(normalizeJsonPath(path))
  }

  return target
}

function movePath(value: unknown, sourcePath: string, targetPath: string, affectedPaths: string[]) {
  const next = cloneJson(value)
  const found = getPath(next, sourcePath)
  if (!found.exists) throw new Error(`Source path not found: ${sourcePath}`)

  setPath(next, targetPath, found.value, false)
  deletePath(next, sourcePath)
  affectedPaths.push(normalizeJsonPath(sourcePath), normalizeJsonPath(targetPath))
  return next
}

function flattenAny(value: unknown, affectedPaths: string[]) {
  if (Array.isArray(value)) {
    affectedPaths.push("$")
    return value.map((item) => (isRecord(item) ? flattenValue(item) : { value: item }))
  }

  affectedPaths.push("$")
  return isRecord(value) ? flattenValue(value) : { value }
}

function unflattenObject(value: unknown, affectedPaths: string[]) {
  if (!isRecord(value)) throw new Error("Unflatten expects an object with flattened keys.")
  const root = createSafeRecord()

  for (const [path, item] of Object.entries(value)) {
    const normalized = path.startsWith("$") ? path : `$.${path}`
    setPath(root, normalized, cloneJson(item), false)
    affectedPaths.push(normalized)
  }

  return root
}

function explodeArrayRows(value: unknown, arrayPath: string, affectedPaths: string[]) {
  const rows = Array.isArray(value) ? value : [value]
  const output: unknown[] = []

  rows.forEach((row, rowIndex) => {
    const found = getPath(row, arrayPath)
    if (!found.exists || !Array.isArray(found.value)) return

    found.value.forEach((item, itemIndex) => {
      const parent = isRecord(row) ? cloneJson(row) as MutableRecord : { value: row }
      deletePath(parent, arrayPath)
      output.push({
        ...parent,
        itemIndex,
        parentRow: rowIndex,
        ...(isRecord(item) ? item : { value: item }),
      })
    })

    affectedPaths.push(`${normalizeJsonPath(arrayPath)}@row${rowIndex}`)
  })

  return output
}

function groupRows(
  value: unknown,
  keys: string[],
  childKey: string,
  affectedPaths: string[]
) {
  if (!Array.isArray(value)) throw new Error("Grouping expects a root array of records.")
  if (!keys.length) throw new Error("Add at least one grouping key.")

  const groups = new Map<string, MutableRecord>()

  for (const row of value) {
    if (!isRecord(row)) continue
    const groupValues = Object.fromEntries(keys.map((key) => [key, row[key]]))
    const signature = JSON.stringify(groupValues)
    const group = groups.get(signature) ?? { ...groupValues, [childKey]: [] }
    const child = createSafeRecord()

    for (const [key, item] of Object.entries(row)) {
      if (!keys.includes(key)) child[key] = item
    }

    ;(group[childKey] as unknown[]).push(child)
    groups.set(signature, group)
  }

  affectedPaths.push("$")
  return Array.from(groups.values())
}

function objectMapToArray(value: unknown, keyField: string, affectedPaths: string[]) {
  if (!isRecord(value)) throw new Error("Object-map conversion expects a root object.")
  affectedPaths.push("$")

  return Object.entries(value).map(([key, item]) =>
    isRecord(item) ? { [keyField]: key, ...item } : { [keyField]: key, value: item }
  )
}

function arrayToObjectMap(value: unknown, keyField: string, affectedPaths: string[]) {
  if (!Array.isArray(value)) throw new Error("Array-map conversion expects a root array.")
  const output = createSafeRecord()

  value.forEach((item, index) => {
    if (!isRecord(item)) throw new Error("Array-map conversion expects object rows.")
    const key = item[keyField]
    if (typeof key !== "string" && typeof key !== "number") {
      throw new Error(`Row ${index + 1} is missing a string or number ${keyField}.`)
    }
    if (Object.prototype.hasOwnProperty.call(output, String(key))) {
      throw new Error(`Duplicate identity key: ${String(key)}`)
    }
    const rest = { ...item }
    delete rest[keyField]
    output[String(key)] = rest
    affectedPaths.push(`$[${index}].${keyField}`)
  })

  return output
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys)
  if (!isRecord(value)) return value

  const sorted = createSafeRecord()
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = sortJsonKeys(value[key])
  }
  return sorted
}

function sortArraysByField(value: unknown, field: string, affectedPaths: string[], path = "$"): unknown {
  if (Array.isArray(value)) {
    const next = value.map((item, index) => sortArraysByField(item, field, affectedPaths, `${path}[${index}]`))
    if (next.every(isRecord) && next.some((item) => Object.prototype.hasOwnProperty.call(item, field))) {
      affectedPaths.push(path)
      return [...next].sort((a, b) => compareValues(a[field], b[field]))
    }
    return next
  }
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      sortArraysByField(item, field, affectedPaths, appendDisplayPath(path, key)),
    ])
  )
}

function dedupeArrays(value: unknown, affectedPaths: string[], path = "$"): unknown {
  if (Array.isArray(value)) {
    const seen = new Set<string>()
    const next: unknown[] = []

    value.forEach((item, index) => {
      const child = dedupeArrays(item, affectedPaths, `${path}[${index}]`)
      const signature = JSON.stringify(sortJsonKeys(child))
      if (!seen.has(signature)) {
        seen.add(signature)
        next.push(child)
      }
    })

    if (next.length !== value.length) affectedPaths.push(path)
    return next
  }
  if (!isRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      dedupeArrays(item, affectedPaths, appendDisplayPath(path, key)),
    ])
  )
}

function replaceStrings(
  value: unknown,
  pattern: string,
  replacement: string,
  affectedPaths: string[]
) {
  const regex = new RegExp(pattern, "g")

  return mapJsonValues(value, affectedPaths, (item, path) => {
    if (typeof item !== "string") return item
    const next = item.replace(regex, replacement)
    if (next !== item) affectedPaths.push(path)
    return next
  })
}

function convertPrimitiveStrings(value: unknown, affectedPaths: string[]) {
  return mapJsonValues(value, affectedPaths, (item, path) => {
    if (typeof item !== "string") return item
    const text = item.trim()

    if (/^-?\d+(\.\d+)?$/.test(text)) {
      affectedPaths.push(path)
      return Number(text)
    }
    if (/^(true|false)$/i.test(text)) {
      affectedPaths.push(path)
      return text.toLowerCase() === "true"
    }

    return item
  })
}

function normalizeNullLike(value: unknown, tokensText: string | undefined, affectedPaths: string[]) {
  const tokens = new Set(
    (tokensText?.trim() ? parseCsv(tokensText) : ["", "na", "n/a", "null", "undefined"])
      .map((token) => token.toLowerCase())
  )

  return mapJsonValues(value, affectedPaths, (item, path) => {
    if (typeof item !== "string") return item
    if (!tokens.has(item.trim().toLowerCase())) return item
    affectedPaths.push(path)
    return null
  })
}

function normalizeDates(value: unknown, affectedPaths: string[]) {
  return mapJsonValues(value, affectedPaths, (item, path) => {
    if (typeof item !== "string") return item
    if (!/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(item.trim())) return item

    const date = new Date(item)
    if (Number.isNaN(date.getTime())) return item

    affectedPaths.push(path)
    return date.toISOString().slice(0, 10)
  })
}

function addComputedField(
  value: unknown,
  field: string,
  template: string,
  affectedPaths: string[]
) {
  const rows = Array.isArray(value) ? value : [value]
  const output = rows.map((row, index) => {
    if (!isRecord(row)) return row
    const next = { ...row, [field]: renderTemplate(template, row) }
    affectedPaths.push(Array.isArray(value) ? `$[${index}].${field}` : `$.${field}`)
    return next
  })

  return Array.isArray(value) ? output : output[0]
}

function maskSensitiveValues(value: unknown, selectorsText: string | undefined, affectedPaths: string[]) {
  const selectors = parseSelectors(selectorsText)
  const sensitiveKeyPattern = /(password|secret|token|api[-_]?key|authorization|ssn|email|phone)/i

  return mapJsonValues(value, affectedPaths, (item, path, key) => {
    const selected = selectors.some((selector) =>
      isJsonPath(selector) ? normalizeJsonPath(selector) === path : selector === key
    )
    const sensitive = selected || (key ? sensitiveKeyPattern.test(key) : false)
    if (!sensitive || (typeof item !== "string" && typeof item !== "number")) return item
    affectedPaths.push(path)
    return maskValue(String(item))
  })
}

function mapJsonValues(
  value: unknown,
  affectedPaths: string[],
  visit: (value: unknown, path: string, key?: string) => unknown,
  path = "$",
  key?: string
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => mapJsonValues(item, affectedPaths, visit, `${path}[${index}]`))
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, item]) => [
        childKey,
        mapJsonValues(item, affectedPaths, visit, appendDisplayPath(path, childKey), childKey),
      ])
    )
  }

  return visit(value, path, key)
}

function removeKeyEverywhere(
  value: unknown,
  key: string,
  path: string,
  affectedPaths: string[]
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => removeKeyEverywhere(item, key, `${path}[${index}]`, affectedPaths))
    return
  }
  if (!isRecord(value)) return

  if (Object.prototype.hasOwnProperty.call(value, key)) {
    delete value[key]
    affectedPaths.push(appendDisplayPath(path, key))
  }

  for (const [childKey, child] of Object.entries(value)) {
    removeKeyEverywhere(child, key, appendDisplayPath(path, childKey), affectedPaths)
  }
}

function getPath(value: unknown, path: string) {
  const tokens = parseJsonPath(path)
  let current = value

  for (const token of tokens) {
    if (Array.isArray(current) && typeof token === "number") {
      current = current[token]
    } else if (isRecord(current) && typeof token === "string") {
      current = current[token]
    } else {
      return { exists: false, value: undefined }
    }
  }

  return { exists: current !== undefined, value: current }
}

function setPath(root: unknown, path: string, value: unknown, overwrite: boolean) {
  const tokens = parseJsonPath(path)
  if (!tokens.length) throw new Error("Cannot replace the root with this operation.")

  let current = root
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const token = tokens[index]
    const nextToken = tokens[index + 1]

    if (Array.isArray(current)) {
      if (typeof token !== "number") {
        throw new Error(`Expected an array index while traversing ${path}.`)
      }
      if (current[token] === undefined) {
        current[token] = typeof nextToken === "number" ? [] : createSafeRecord()
      }
      current = current[token]
      continue
    }

    if (isRecord(current)) {
      if (typeof token !== "string") {
        throw new Error(`Expected an object key while traversing ${path}.`)
      }
      if (current[token] === undefined) {
        current[token] = typeof nextToken === "number" ? [] : createSafeRecord()
      }
      current = current[token]
      continue
    }

    throw new Error(`Cannot traverse ${tokens.slice(0, index + 1).join(".")}.`)
  }

  const last = tokens[tokens.length - 1]
  if (Array.isArray(current)) {
    if (typeof last !== "number") throw new Error(`Expected an array index for ${path}.`)
    if (!overwrite && current[last] !== undefined) throw new Error(`Target path already exists: ${path}`)
    current[last] = value
    return
  }

  if (isRecord(current)) {
    if (typeof last !== "string") throw new Error(`Expected an object key for ${path}.`)
    if (!overwrite && current[last] !== undefined) throw new Error(`Target path already exists: ${path}`)
    current[last] = value
    return
  }

  throw new Error(`Cannot write target path: ${path}`)
}

function deletePath(root: unknown, path: string) {
  const tokens = parseJsonPath(path)
  if (!tokens.length) return false

  let current = root
  for (const token of tokens.slice(0, -1)) {
    if (Array.isArray(current) && typeof token === "number") current = current[token]
    else if (isRecord(current) && typeof token === "string") current = current[token]
    else return false
  }

  const last = tokens[tokens.length - 1]
  if (Array.isArray(current) && typeof last === "number" && last in current) {
    current.splice(last, 1)
    return true
  }
  if (isRecord(current) && typeof last === "string" && Object.prototype.hasOwnProperty.call(current, last)) {
    delete current[last]
    return true
  }

  return false
}

function parseJsonPath(path: string) {
  const normalized = normalizeJsonPath(path)
  const tokens: Array<string | number> = []
  let index = normalized.startsWith("$") ? 1 : 0

  while (index < normalized.length) {
    if (normalized[index] === ".") {
      index += 1
      let end = index
      while (end < normalized.length && normalized[end] !== "." && normalized[end] !== "[") end += 1
      tokens.push(normalized.slice(index, end))
      index = end
      continue
    }
    if (normalized[index] === "[") {
      const end = normalized.indexOf("]", index)
      if (end < 0) throw new Error(`Invalid JSON path: ${path}`)
      const content = normalized.slice(index + 1, end)
      tokens.push(/^\d+$/.test(content) ? Number(content) : JSON.parse(content))
      index = end + 1
      continue
    }
    throw new Error(`Invalid JSON path: ${path}`)
  }

  return tokens
}

function parseKeyMappings(text: string | undefined) {
  return (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.includes("=>") ? "=>" : "="
      const [from, to] = line.split(separator).map((part) => part.trim())
      if (!from || !to) throw new Error(`Invalid mapping: ${line}`)
      return [from, to] as [string, string]
    })
}

function parseSelectors(text: string | undefined) {
  return (text ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseCsv(text: string | undefined) {
  return (text ?? "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function renderTemplate(template: string, row: MutableRecord) {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, key: string) => {
    const value = row[key.trim()]
    return value === undefined || value === null ? "" : String(value)
  })
}

function maskValue(value: string) {
  if (value.length <= 4) return "*".repeat(value.length)
  return `${value.slice(0, 2)}${"*".repeat(Math.max(3, value.length - 4))}${value.slice(-2)}`
}

function appendDisplayPath(path: string, key: string) {
  const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? key
    : `[${JSON.stringify(key)}]`

  if (path === "$") return segment.startsWith("[") ? `${path}${segment}` : `${path}.${segment}`
  return segment.startsWith("[") ? `${path}${segment}` : `${path}.${segment}`
}

function normalizeJsonPath(path: string) {
  const trimmed = path.trim()
  if (!trimmed || trimmed === "$") return "$"
  return trimmed.startsWith("$") ? trimmed : `$.${trimmed}`
}

function isJsonPath(selector: string) {
  return selector.startsWith("$") || selector.includes(".") || selector.includes("[")
}

function required(value: string | undefined, label: string) {
  const text = value?.trim()
  if (!text) throw new Error(`${label} is required.`)
  return text
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value))
}

function createSafeRecord() {
  return Object.create(null) as MutableRecord
}
