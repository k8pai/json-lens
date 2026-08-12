export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type FlatRow = {
  id: number
  original: unknown
  flat: Record<string, unknown>
}

export type ParseResult = {
  value: unknown | null
  error: string | null
  line?: number
  column?: number
}

export type SortState = {
  column: string
  direction: "asc" | "desc"
} | null

export type ColumnStats = {
  column: string
  type: string
  uniqueCount: number
  emptyCount: number
  values: { value: string; count: number; percentage: number }[]
  warnings: string[]
}

export type RowSourceMode =
  | "auto"
  | "array-items"
  | "object-entries"
  | "single-object"
  | "nested-path"

export type RowSourceConfig = {
  mode: RowSourceMode
  nestedPath?: string
  columnLimit?: number
  deferHeavyWork?: boolean
  previewRowLimit?: number
}

export type ArrayPathCandidate = {
  path: string
  label: string
  length: number
  itemKind: string
}

export type ShapeSummary = {
  rootType: string
  description: string
  recommendedMode: RowSourceMode
  candidateArrays: ArrayPathCandidate[]
  warnings: string[]
}

export type ArrayColumnCandidate = {
  column: string
  rowsWithArrays: number
  maxItems: number
  itemKind: string
}

export type JsonLensProcessedData = {
  parseResult: ParseResult
  rows: FlatRow[]
  totalRows: number
  columns: string[]
  allColumnCount: number
  arrayColumnCandidates: ArrayColumnCandidate[]
  columnLimitWarning: string | null
  columnValueOptions: Record<string, string[]>
  deferredStats: boolean
  isPreview: boolean
  processingWarnings: string[]
  rowSource: RowSourceConfig
  shapeSummary: ShapeSummary
  stats: ColumnStats[]
  typeScript: string
  jsonStats: ReturnType<typeof countJsonStats> | null
  sourceSummary: string
}

const DEFAULT_COLUMN_LIMIT = 200
const MAX_TYPE_KEYS = 5000
const HEAVY_STATS_CELL_LIMIT = 120_000

export const SAMPLE_JSON = JSON.stringify(
  [
    {
      id: 1001,
      status: "active",
      user: {
        name: "Maya Chen",
        email: "maya@example.com",
        city: "Austin",
      },
      plan: "Team",
      seats: 12,
      tags: ["admin", "billing"],
      lastLogin: "2026-07-14",
    },
    {
      id: 1002,
      status: "pending",
      user: {
        name: "Noah Reed",
        email: "noah@example.com",
        city: "Denver",
      },
      plan: "Starter",
      seats: 3,
      tags: ["viewer"],
      lastLogin: null,
    },
    {
      id: 1003,
      status: "active",
      user: {
        name: "Iris Patel",
        email: "iris@example.com",
        city: "Austin",
      },
      plan: "Team",
      seats: 8,
      tags: ["editor", "analytics"],
      lastLogin: "2026-07-12",
    },
    {
      id: 1004,
      status: "disabled",
      user: {
        name: "Leo Torres",
        city: "Portland",
      },
      plan: "Enterprise",
      seats: 42,
      tags: [],
      lastLogin: "2026-06-28",
    },
  ],
  null,
  2
)

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseJson(input: string): ParseResult {
  if (!input.trim()) {
    return { value: null, error: "Paste JSON or load the sample to begin." }
  }

  try {
    return { value: JSON.parse(input) as JsonValue, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON."
    const positionMatch = message.match(/position\s+(\d+)/i)
    const lineColumnMatch = message.match(/line\s+(\d+)\s+column\s+(\d+)/i)

    if (lineColumnMatch) {
      return {
        value: null,
        error: friendlyJsonError(message),
        line: Number(lineColumnMatch[1]),
        column: Number(lineColumnMatch[2]),
      }
    }

    if (positionMatch) {
      const position = Number(positionMatch[1])
      const before = input.slice(0, Math.max(0, position))
      const lines = before.split("\n")

      return {
        value: null,
        error: friendlyJsonError(message),
        line: lines.length,
        column: lines[lines.length - 1].length + 1,
      }
    }

    return { value: null, error: friendlyJsonError(message) }
  }
}

export function friendlyJsonError(message: string) {
  if (message.toLowerCase().includes("unexpected end")) {
    return "This JSON stops too early. Check for a missing closing bracket, brace, or quote."
  }

  return `This does not look like valid JSON yet. ${message}`
}

export function flattenValue(
  value: unknown,
  prefix = "",
  target: Record<string, unknown> = {}
) {
  if (isRecord(value)) {
    const entries = Object.entries(value)

    if (entries.length === 0 && prefix) {
      target[prefix] = {}
    }

    for (const [key, child] of entries) {
      const path = prefix ? `${prefix}.${key}` : key

      if (isRecord(child)) {
        flattenValue(child, path, target)
      } else {
        target[path] = child
      }
    }
  } else if (prefix) {
    target[prefix] = value
  }

  return target
}

export function normalizeRows(value: unknown): FlatRow[] {
  const source = Array.isArray(value) ? value : [value]

  return normalizeArrayRows(source)
}

function normalizeArrayRows(source: unknown[], limit?: number): FlatRow[] {
  const rows = typeof limit === "number" ? source.slice(0, limit) : source

  return rows.map((item, index) => ({
    id: index + 1,
    original: item,
    flat: isRecord(item) ? flattenValue(item) : { value: item },
  }))
}

export function normalizeRowsForSource(
  value: unknown,
  config: RowSourceConfig,
  shape = detectJsonShape(value)
): { rows: FlatRow[]; rowSource: RowSourceConfig; totalRows: number } {
  const mode = config.mode === "auto" ? shape.recommendedMode : config.mode
  const rowSource = { ...config, mode }
  const limit = config.previewRowLimit

  if (mode === "array-items") {
    const source = Array.isArray(value) ? value : []
    return {
      rows: normalizeArrayRows(source, limit),
      rowSource,
      totalRows: source.length,
    }
  }

  if (mode === "object-entries" && isRecord(value)) {
    const entries = Object.entries(value)
    const limitedEntries =
      typeof limit === "number" ? entries.slice(0, limit) : entries

    return {
      rows: limitedEntries.map(([key, item], index) => ({
        id: index + 1,
        original: item,
        flat: isRecord(item)
          ? { key, ...flattenValue(item) }
          : { key, value: item },
      })),
      rowSource,
      totalRows: entries.length,
    }
  }

  if (mode === "nested-path") {
    const nestedValue = getJsonPathValue(value, config.nestedPath ?? "")
    const source = Array.isArray(nestedValue) ? nestedValue : []

    return {
      rows: normalizeArrayRows(source, limit),
      rowSource,
      totalRows: source.length,
    }
  }

  return { rows: normalizeRows(value), rowSource, totalRows: 1 }
}

export function getColumns(rows: FlatRow[]) {
  return Array.from(
    rows.reduce((set, row) => {
      Object.keys(row.flat).forEach((key) => set.add(key))
      return set
    }, new Set<string>())
  ).sort((a, b) => a.localeCompare(b))
}

export function limitColumns(columns: string[], limit = DEFAULT_COLUMN_LIMIT) {
  if (columns.length <= limit) {
    return { columns, warning: null }
  }

  return {
    columns: columns.slice(0, limit),
    warning: `${columns.length.toLocaleString()} columns were found. Showing the first ${limit.toLocaleString()} so the table stays responsive. Choose a row source or sub-table to narrow the shape.`,
  }
}

export function detectJsonShape(value: unknown): ShapeSummary {
  const candidateArrays = findArrayPathCandidates(value)
  const warnings: string[] = []

  if (Array.isArray(value)) {
    return {
      rootType: "Root array",
      description: `${value.length.toLocaleString()} root array item${
        value.length === 1 ? "" : "s"
      }`,
      recommendedMode: "array-items",
      candidateArrays,
      warnings,
    }
  }

  if (isRecord(value)) {
    const entries = Object.entries(value)
    const objectLikeEntries = entries.filter(([, child]) => isRecord(child) || Array.isArray(child))
    const looksDynamic =
      entries.length >= 50 && objectLikeEntries.length / Math.max(entries.length, 1) >= 0.5

    if (looksDynamic) {
      warnings.push(
        "This looks like an object keyed by dynamic IDs. Object entries mode prevents those keys from becoming thousands of columns."
      )
    }

    return {
      rootType: looksDynamic ? "Dynamic-key object" : "Root object",
      description: looksDynamic
        ? `${entries.length.toLocaleString()} object entries`
        : `${entries.length.toLocaleString()} root fields`,
      recommendedMode: looksDynamic
        ? "object-entries"
        : candidateArrays.length
          ? "nested-path"
          : "single-object",
      candidateArrays,
      warnings,
    }
  }

  return {
    rootType: value === null ? "Null" : `${typeof value} value`,
    description: sourceLabel(value),
    recommendedMode: "single-object",
    candidateArrays,
    warnings,
  }
}

export function findArrayPathCandidates(value: unknown) {
  const candidates: ArrayPathCandidate[] = []

  function walk(item: unknown, path: string, depth: number) {
    if (candidates.length >= 80 || depth > 5) return

    if (Array.isArray(item)) {
      candidates.push({
        path,
        label: path === "$" ? "Root array" : path,
        length: item.length,
        itemKind: inferCollectionItemKind(item),
      })
      item.slice(0, 3).forEach((child) => walk(child, path, depth + 1))
      return
    }

    if (!isRecord(item)) return

    for (const [key, child] of Object.entries(item)) {
      const childPath = path === "$" ? key : `${path}.${key}`
      walk(child, childPath, depth + 1)
    }
  }

  walk(value, "$", 0)

  return candidates
    .filter((candidate, index, source) => {
      if (candidate.path === "$") return false
      return source.findIndex((item) => item.path === candidate.path) === index
    })
    .sort((a, b) => b.length - a.length || a.path.localeCompare(b.path))
}

export function getJsonPathValue(value: unknown, path: string) {
  if (!path || path === "$") return value

  return path.split(".").reduce<unknown>((current, segment) => {
    if (Array.isArray(current)) {
      const index = Number(segment)
      return Number.isInteger(index) ? current[index] : undefined
    }

    if (isRecord(current)) return current[segment]
    return undefined
  }, value)
}

export function getArrayColumnCandidates(rows: FlatRow[], columns: string[]) {
  return columns
    .map((column) => {
      const arrays = rows
        .map((row) => row.flat[column])
        .filter((value): value is unknown[] => Array.isArray(value))

      if (!arrays.length) return null

      return {
        column,
        rowsWithArrays: arrays.length,
        maxItems: Math.max(...arrays.map((items) => items.length)),
        itemKind: inferCollectionItemKind(arrays.flatMap((items) => items.slice(0, 5))),
      }
    })
    .filter((candidate): candidate is ArrayColumnCandidate => Boolean(candidate))
}

export function inferCollectionItemKind(items: unknown[]) {
  if (items.length === 0) return "empty"

  const kinds = Array.from(
    new Set(
      items.slice(0, 25).map((item) => {
        if (Array.isArray(item)) return "array"
        if (isRecord(item)) return "object"
        if (item === null) return "null"
        return typeof item
      })
    )
  )

  return kinds.length === 1 ? kinds[0] : "mixed"
}

export function valueType(value: unknown) {
  if (value === null || value === undefined || value === "") return "empty"
  if (Array.isArray(value)) return "array"
  if (isRecord(value)) return "object"
  if (typeof value === "string" && isDateLike(value)) return "date"
  return typeof value
}

export function isDateLike(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value))
}

export function displayValue(value: unknown) {
  if (value === undefined || value === "") return ""
  if (value === null) return "null"
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]"
    if (value.every((item) => !isRecord(item) && !Array.isArray(item))) {
      return value.map(String).join(", ")
    }
    return `${value.length} items`
  }
  if (isRecord(value)) return `${Object.keys(value).length} fields`
  return String(value)
}

export function stringifyPretty(value: unknown, space = 2) {
  return JSON.stringify(value, null, space)
}

export function computeStats(rows: FlatRow[], columns: string[]): ColumnStats[] {
  return columns.map((column) => {
    const frequency = new Map<string, number>()
    const typeCounts = new Map<string, number>()
    let emptyCount = 0

    for (const row of rows) {
      const value = row.flat[column]
      const type = valueType(value)
      typeCounts.set(type, (typeCounts.get(type) ?? 0) + 1)

      if (type === "empty") emptyCount += 1

      const key = displayValue(value) || "(blank)"
      frequency.set(key, (frequency.get(key) ?? 0) + 1)
    }

    const nonEmptyTypes = Array.from(typeCounts.keys()).filter(
      (type) => type !== "empty"
    )
    const warnings: string[] = []
    const nonEmptyTotal = rows.length - emptyCount
    const uniqueCount = Array.from(frequency.keys()).filter(
      (key) => key !== "(blank)" && key !== "null"
    ).length

    if (nonEmptyTypes.length > 1) warnings.push("Mixed value types")
    if (rows.length > 0 && emptyCount / rows.length >= 0.35) {
      warnings.push("Many rows are empty here")
    }
    if (
      nonEmptyTotal > uniqueCount &&
      /(^id$|\.id$|_id$|identifier)/i.test(column)
    ) {
      warnings.push("Possible duplicate IDs")
    }

    return {
      column,
      type: nonEmptyTypes.length > 1 ? "mixed" : nonEmptyTypes[0] ?? "empty",
      uniqueCount,
      emptyCount,
      values: Array.from(frequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([value, count]) => ({
          value,
          count,
          percentage: rows.length === 0 ? 0 : Math.round((count / rows.length) * 100),
        })),
      warnings,
    }
  })
}

export function getColumnValueOptions(
  rows: FlatRow[],
  columns: string[],
  limit = 250
) {
  return Object.fromEntries(
    columns.map((column) => {
      const values = Array.from(
        rows.reduce((set, row) => {
          const value = displayValue(row.flat[column]) || "(blank)"
          set.add(value)
          return set
        }, new Set<string>())
      )
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .slice(0, limit)

      return [column, values]
    })
  )
}

export function compareValues(a: unknown, b: unknown) {
  if (typeof a === "number" && typeof b === "number") return a - b

  return displayValue(a).localeCompare(displayValue(b), undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

export function escapeCsv(value: unknown) {
  const text = displayValue(value)

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`
  }

  return text
}

export function rowsToCsv(rows: FlatRow[], columns: string[]) {
  const header = ["#", ...columns].map(escapeCsv).join(",")
  const body = rows.map((row) =>
    [row.id, ...columns.map((column) => row.flat[column])]
      .map(escapeCsv)
      .join(",")
  )

  return [header, ...body].join("\n")
}

export function safeInterfaceName(name: string) {
  const cleaned = name
    .replace(/[^a-zA-Z0-9_]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("")

  return /^[A-Za-z_]/.test(cleaned) ? cleaned : `Type${cleaned || "Value"}`
}

export function safePropertyName(name: string) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name)
}

export function generateTypes(value: unknown, rootName = "Root") {
  const rootTypeName = safeInterfaceName(rootName)
  const declarations: string[] = []
  const seenNames = new Set<string>()

  function uniqueName(name: string) {
    let candidate = safeInterfaceName(name)
    let index = 2

    while (seenNames.has(candidate)) {
      candidate = `${safeInterfaceName(name)}${index}`
      index += 1
    }

    seenNames.add(candidate)
    return candidate
  }

  function inferArray(values: unknown[], name: string): string {
    if (values.length === 0) return "unknown[]"
    return `${combineTypes(values.map((item) => inferValue(item, `${name}Item`)))}[]`
  }

  function inferObject(records: Record<string, unknown>[], name: string): string {
    const interfaceName = uniqueName(name)
    const keys = Array.from(
      records.reduce((set, record) => {
        Object.keys(record).forEach((key) => set.add(key))
        return set
      }, new Set<string>())
    ).sort((a, b) => a.localeCompare(b))

    const fields = keys.map((key) => {
      const presentValues = records
        .filter((record) => Object.prototype.hasOwnProperty.call(record, key))
        .map((record) => record[key])
      const optional = presentValues.length < records.length ? "?" : ""
      const types = presentValues.map((fieldValue) =>
        inferValue(fieldValue, `${interfaceName}${safeInterfaceName(key)}`)
      )

      return `  ${safePropertyName(key)}${optional}: ${combineTypes(types)};`
    })

    declarations.unshift(
      `interface ${interfaceName} {\n${
        fields.join("\n") || "  [key: string]: unknown;"
      }\n}`
    )

    return interfaceName
  }

  function inferValue(item: unknown, name: string): string {
    if (item === null) return "null"
    if (Array.isArray(item)) return inferArray(item, name)
    if (isRecord(item)) return inferObject([item], name)
    if (typeof item === "string") return "string"
    if (typeof item === "number") return "number"
    if (typeof item === "boolean") return "boolean"
    return "unknown"
  }

  let rootDeclaration = ""

  if (Array.isArray(value)) {
    const objectItems = value.filter(isRecord)

    if (objectItems.length === value.length && objectItems.length > 0) {
      const itemType = inferObject(objectItems, rootTypeName)
      rootDeclaration = `type ${rootTypeName} = ${itemType}[];`
    } else {
      rootDeclaration = `type ${rootTypeName} = ${inferArray(value, rootTypeName)};`
    }
  } else if (isRecord(value)) {
    inferObject([value], rootTypeName)
  } else {
    rootDeclaration = `type ${rootTypeName} = ${inferValue(value, rootTypeName)};`
  }

  return [rootDeclaration, ...declarations].filter(Boolean).join("\n\n")
}

export function combineTypes(types: string[]) {
  const unique = Array.from(new Set(types)).sort((a, b) => {
    if (a === "null") return 1
    if (b === "null") return -1
    return a.localeCompare(b)
  })

  return unique.length === 0 ? "unknown" : unique.join(" | ")
}

export function countJsonStats(value: unknown) {
  let objects = 0
  let arrays = 0
  let keys = 0
  let maxDepth = 0

  function walk(item: unknown, depth: number) {
    maxDepth = Math.max(maxDepth, depth)

    if (Array.isArray(item)) {
      arrays += 1
      item.forEach((child) => walk(child, depth + 1))
      return
    }

    if (isRecord(item)) {
      objects += 1
      keys += Object.keys(item).length
      Object.values(item).forEach((child) => walk(child, depth + 1))
    }
  }

  walk(value, 0)

  return { objects, arrays, keys, maxDepth }
}

export function sourceLabel(value: unknown) {
  if (Array.isArray(value)) return `${value.length} root items`
  if (isRecord(value)) return "Single object"
  if (value === null) return "Null value"
  return `${typeof value} value`
}

export function createJsonLensProcessedData(input: string): JsonLensProcessedData {
  return createJsonLensProcessedDataWithConfig(input, { mode: "auto" })
}

export type ProcessingUpdate = {
  stage: "parse" | "shape" | "rows" | "columns" | "stats" | "done"
  message: string
  progress: number
}

export function createJsonLensProcessedDataWithConfig(
  input: string,
  config: RowSourceConfig = { mode: "auto" },
  onProgress?: (update: ProcessingUpdate) => void
): JsonLensProcessedData {
  onProgress?.({
    stage: "parse",
    message: "Parsing JSON",
    progress: 10,
  })

  const parseResult = parseJson(input)

  if (parseResult.error) {
    return {
      parseResult,
      rows: [],
      totalRows: 0,
      columns: [],
      allColumnCount: 0,
      arrayColumnCandidates: [],
      columnLimitWarning: null,
      columnValueOptions: {},
      deferredStats: false,
      isPreview: false,
      processingWarnings: [],
      rowSource: config,
      shapeSummary: {
        rootType: "Needs JSON",
        description: "Paste valid JSON to inspect its shape.",
        recommendedMode: "auto",
        candidateArrays: [],
        warnings: [],
      },
      stats: [],
      typeScript: "",
      jsonStats: null,
      sourceSummary: "Needs JSON",
    }
  }

  const value = parseResult.value
  onProgress?.({
    stage: "shape",
    message: "Detecting JSON shape",
    progress: 25,
  })
  const shapeSummary = detectJsonShape(value)
  onProgress?.({
    stage: "rows",
    message: "Preparing preview rows",
    progress: 45,
  })
  const { rows, rowSource, totalRows } = normalizeRowsForSource(
    value,
    config,
    shapeSummary
  )
  const isPreview = rows.length < totalRows
  const processingWarnings: string[] = []

  if (isPreview) {
    processingWarnings.push(
      `Previewing ${rows.length.toLocaleString()} of ${totalRows.toLocaleString()} rows. Process the full dataset when you are ready for complete filtering, stats, and exports.`
    )
  }

  onProgress?.({
    stage: "columns",
    message: "Discovering columns",
    progress: 65,
  })
  const allColumns = getColumns(rows)
  const { columns, warning } = limitColumns(
    allColumns,
    config.columnLimit ?? DEFAULT_COLUMN_LIMIT
  )
  const jsonStats = countJsonStats(value)
  const statsCellCount = rows.length * Math.max(columns.length, 1)
  const deferredStats =
    Boolean(config.deferHeavyWork) || statsCellCount > HEAVY_STATS_CELL_LIMIT
  const typeScript =
    deferredStats || jsonStats.keys > MAX_TYPE_KEYS
      ? `// Type generation skipped for this large preview.\n// Narrow the row source or process the full dataset before generating TypeScript.`
      : generateTypes(value, "Root")

  if (deferredStats) {
    processingWarnings.push(
      "Stats, enum options, and TypeScript generation are deferred in large-data mode."
    )
  }

  onProgress?.({
    stage: "stats",
    message: deferredStats ? "Deferring expensive stats" : "Computing stats",
    progress: 85,
  })
  onProgress?.({
    stage: "done",
    message: "Table data ready",
    progress: 100,
  })

  return {
    parseResult: { ...parseResult, value: null },
    rows,
    totalRows,
    columns,
    allColumnCount: allColumns.length,
    arrayColumnCandidates: getArrayColumnCandidates(rows, allColumns),
    columnLimitWarning: warning,
    columnValueOptions: getColumnValueOptions(
      deferredStats ? rows.slice(0, 500) : rows,
      columns
    ),
    deferredStats,
    isPreview,
    processingWarnings,
    rowSource,
    shapeSummary,
    stats: deferredStats ? [] : computeStats(rows, columns),
    typeScript,
    jsonStats,
    sourceSummary:
      rowSource.mode === "nested-path" && config.nestedPath
      ? `${config.nestedPath}: ${rows.length.toLocaleString()} rows`
      : shapeSummary.description,
  }
}

export function downloadText(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function copyText(content: string) {
  await navigator.clipboard.writeText(content)
}
