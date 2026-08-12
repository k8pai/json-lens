import {
  displayValue,
  isRecord,
  parseJson,
  rowsToCsv,
  stringifyPretty,
  type FlatRow,
} from "./json-lens"
import type { ContractBundle } from "./json-schema-contracts"

export type ExportFormat =
  | "json"
  | "csv"
  | "tsv"
  | "ndjson"
  | "markdown"
  | "typescript"
  | "json-schema"
  | "zod"
  | "openapi"

export function rowsToTsv(rows: FlatRow[], columns: string[]) {
  const header = ["#", "sourcePath", ...columns].map(escapeTsv).join("\t")
  const body = rows.map((row) =>
    [row.id, row.sourcePath, ...columns.map((column) => row.flat[column])]
      .map(escapeTsv)
      .join("\t")
  )

  return [header, ...body].join("\n")
}

export function rowsToNdjson(rows: FlatRow[]) {
  return rows.map((row) => JSON.stringify(row.original)).join("\n")
}

export function rowsToMarkdownTable(rows: FlatRow[], columns: string[]) {
  const headers = ["#", "sourcePath", ...columns]
  const separator = headers.map(() => "---")
  const body = rows.map((row) =>
    [row.id, row.sourcePath, ...columns.map((column) => row.flat[column])].map(escapeMarkdownCell)
  )

  return [
    `| ${headers.map(escapeMarkdownCell).join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")
}

export function exportSelectedSubtree(input: string, path: string, indentationWidth = 2) {
  const parsed = parseJson(input)
  if (parsed.error) return { ok: false as const, error: parsed.error, output: "" }

  try {
    const value = getByDisplayPath(parsed.value, path)
    return {
      ok: true as const,
      error: null,
      output: stringifyPretty(value, indentationWidth),
    }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Could not export subtree.",
      output: "",
    }
  }
}

export function serializeExport({
  bundle,
  columns,
  format,
  indentationWidth,
  input,
  rows,
}: {
  bundle?: ContractBundle
  columns: string[]
  format: ExportFormat
  indentationWidth: number
  input: string
  rows: FlatRow[]
}) {
  if (format === "json") return input
  if (format === "csv") return rowsToCsv(rows, columns)
  if (format === "tsv") return rowsToTsv(rows, columns)
  if (format === "ndjson") return rowsToNdjson(rows)
  if (format === "markdown") return rowsToMarkdownTable(rows, columns)
  if (format === "typescript") return bundle?.typeScript ?? ""
  if (format === "json-schema") return bundle?.jsonSchemaText ?? ""
  if (format === "zod") return bundle?.zodSchema ?? ""
  if (format === "openapi") return bundle?.openApiSchema ?? ""

  const parsed = parseJson(input)
  return parsed.error ? input : stringifyPretty(parsed.value, indentationWidth)
}

export function getExportFilename(format: ExportFormat) {
  const extensions: Record<ExportFormat, string> = {
    json: "json",
    csv: "csv",
    tsv: "tsv",
    ndjson: "ndjson",
    markdown: "md",
    typescript: "ts",
    "json-schema": "schema.json",
    zod: "schema.ts",
    openapi: "openapi.json",
  }

  return `json-lens.${extensions[format]}`
}

export function getExportMimeType(format: ExportFormat) {
  if (format === "csv") return "text/csv"
  if (format === "tsv") return "text/tab-separated-values"
  if (format === "markdown") return "text/markdown"
  if (format === "typescript" || format === "zod") return "text/typescript"
  return "application/json"
}

function escapeTsv(value: unknown) {
  return displayValue(value).replace(/\t/g, " ").replace(/\r?\n/g, " ")
}

function escapeMarkdownCell(value: unknown) {
  return displayValue(value)
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>")
}

function getByDisplayPath(value: unknown, path: string) {
  const tokens = parseDisplayPath(path)
  let current = value

  for (const token of tokens) {
    if (Array.isArray(current) && typeof token === "number") {
      current = current[token]
    } else if (isRecord(current) && typeof token === "string") {
      current = current[token]
    } else {
      throw new Error(`Path not found: ${path}`)
    }
  }

  return current
}

function parseDisplayPath(path: string) {
  const trimmed = path.trim()
  const normalized = trimmed.startsWith("$") ? trimmed : `$.${trimmed}`
  const tokens: Array<string | number> = []
  let index = 1

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
      if (end < 0) throw new Error(`Invalid path: ${path}`)
      const content = normalized.slice(index + 1, end)
      tokens.push(/^\d+$/.test(content) ? Number(content) : JSON.parse(content))
      index = end + 1
      continue
    }

    throw new Error(`Invalid path: ${path}`)
  }

  return tokens
}
