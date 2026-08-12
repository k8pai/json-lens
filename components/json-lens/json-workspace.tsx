"use client"

import { useMemo, useState } from "react"
import {
  BracesIcon,
  BracketsIcon,
  CaseSensitiveIcon,
  ChevronDownIcon,
  ClipboardIcon,
  EraserIcon,
  FileCheck2Icon,
  FileJsonIcon,
  Wand2Icon,
  WrapTextIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { copyText, isRecord, parseJson, stringifyPretty } from "@/lib/json-lens"
import {
  buildJsonSourceMap,
  getRangeForDiffKind,
  type JsonSourceMap,
  type JsonTextRange,
} from "@/lib/json-source-map"
import { cn } from "@/lib/utils"
import type { JsonValidationReport } from "@/lib/json-validation"

import {
  FieldExtractionResultPanel,
  FieldValueExtractor,
  type FieldExtractionResult,
} from "./field-value-extractor"
import { JsonCodeEditor, type JsonEditorMarker } from "./json-code-editor"
import { useJsonLens } from "./json-lens-provider"
import { JsonNavigationPanel } from "./json-navigation-panel"
import { SourceManagementPanel } from "./source-management-panel"
import {
  ValidationRepairPanel,
  ValidationReportPanel,
} from "./validation-repair-panel"

type KeyCaseMode = "camel" | "pascal" | "snake" | "kebab" | "upper" | "lower"
type JsonTransformMode =
  | "stringify"
  | "unstringify"
  | "sort-keys"
  | "flatten"
  | "unflatten"
type JsonDiffKind =
  | "left-only"
  | "right-only"
  | "changed"
  | "type"
  | "null"
  | "array-count"
type JsonValueType =
  | "array"
  | "boolean"
  | "missing"
  | "null"
  | "number"
  | "object"
  | "string"
type ActiveJsonTool = "extract" | "validate" | null

type JsonDiffRow = {
  id: string
  kind: JsonDiffKind
  path: string
  leftValue: string
  rightValue: string
  leftType: JsonValueType
  rightType: JsonValueType
  leftRange?: JsonTextRange
  rightRange?: JsonTextRange
}

const RIGHT_INPUT_LIMIT_BYTES = 5 * 1024 * 1024
// Dense editor chips should not use the global pressed translation; it reads as a flash beside large controlled textareas.
const TOOL_CHIP_CLASS = "h-7 rounded-full px-2 text-xs active:!translate-y-0"

const KEY_CASE_OPTIONS: Array<{ mode: KeyCaseMode; label: string }> = [
  { mode: "camel", label: "camelCase" },
  { mode: "pascal", label: "PascalCase" },
  { mode: "snake", label: "snake_case" },
  { mode: "kebab", label: "kebab-case" },
  { mode: "upper", label: "UPPERCASE" },
  { mode: "lower", label: "lowercase" },
]

const JSON_TRANSFORM_OPTIONS: Array<{ mode: JsonTransformMode; label: string }> = [
  { mode: "stringify", label: "Stringify" },
  { mode: "unstringify", label: "Unstringify" },
  { mode: "sort-keys", label: "Sort Keys" },
  { mode: "flatten", label: "Flatten" },
  { mode: "unflatten", label: "Unflatten" },
]

const DIFF_TAGS: Array<{ kind: JsonDiffKind; label: string; title: string }> = [
  {
    kind: "left-only",
    label: "Left Only",
    title: "Paths present in Source JSON and missing from Output JSON",
  },
  {
    kind: "right-only",
    label: "Right Only",
    title: "Paths present in Output JSON and missing from Source JSON",
  },
  {
    kind: "changed",
    label: "Changed",
    title: "Primitive values differ while the JSON type stays the same",
  },
  {
    kind: "type",
    label: "Type",
    title: "The same path has different JSON value types",
  },
  {
    kind: "null",
    label: "Null",
    title: "One side is explicitly null while the other side has a value",
  },
  {
    kind: "array-count",
    label: "Array Count",
    title: "The same array path has a different number of items",
  },
]

export function JsonWorkspace() {
  const lens = useJsonLens()
  const [outputJson, setOutputJson] = useState("")
  const [comparisonSummary, setComparisonSummary] = useState("")
  const [diffRows, setDiffRows] = useState<JsonDiffRow[]>([])
  const [validationReport, setValidationReport] =
    useState<JsonValidationReport | null>(null)
  const [extractionResult, setExtractionResult] =
    useState<FieldExtractionResult | null>(null)
  const [activeTool, setActiveTool] = useState<ActiveJsonTool>(null)
  const [activeMarkerId, setActiveMarkerId] = useState<string | undefined>()
  const [activeJsonPath, setActiveJsonPath] = useState<string | undefined>()
  const [activeDiffTags, setActiveDiffTags] = useState<Set<JsonDiffKind>>(
    () => new Set()
  )
  const outputBytes = useMemo(() => new Blob([outputJson]).size, [outputJson])
  const disableLargeLeftOperation = Boolean(lens.largeInputWarning)
  const disableLargeOutputOperation = outputBytes >= RIGHT_INPUT_LIMIT_BYTES
  const disableLargeCompare = lens.inputBytes + outputBytes >= RIGHT_INPUT_LIMIT_BYTES
  const diffTagCounts = useMemo(() => countDiffTags(diffRows), [diffRows])
  const filteredDiffRows = useMemo(() => {
    if (!activeDiffTags.size) return diffRows

    return diffRows.filter((row) => activeDiffTags.has(row.kind))
  }, [activeDiffTags, diffRows])
  const sourceEditorMarkers = useMemo(
    () => [
      ...createNavigationMarkers(lens.jsonInput, activeJsonPath),
      ...createValidationMarkers(validationReport),
      ...createDiffMarkers(filteredDiffRows, "left"),
    ],
    [activeJsonPath, filteredDiffRows, lens.jsonInput, validationReport]
  )
  const outputEditorMarkers = useMemo(
    () => createDiffMarkers(filteredDiffRows, "right"),
    [filteredDiffRows]
  )

  function clearDiffResult() {
    setComparisonSummary("")
    setDiffRows([])
    setActiveMarkerId(undefined)
  }

  function selectJsonPath(path: string) {
    setActiveJsonPath(path)
    setActiveMarkerId(`navigation-${path}`)
  }

  function toggleDiffTag(kind: JsonDiffKind) {
    setActiveDiffTags((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  function runKeyCaseConversion(mode: KeyCaseMode) {
    if (disableLargeLeftOperation) {
      lens.notify("Field-name conversion is disabled for large JSON.")
      return
    }

    const parsed = parseJson(lens.jsonInput)
    if (parsed.error) {
      setDiffRows([])
      setComparisonSummary(parsed.error)
      lens.notify("Fix the JSON before converting field names.")
      return
    }

    const result = convertJsonKeys(parsed.value, mode)
    const formatted = stringifyPretty(result.value, lens.indentationWidth)

    if (result.collisions.length) {
      setDiffRows([])
      setComparisonSummary(
        [
          "Conversion blocked because multiple fields would collapse into the same name.",
          "",
          ...result.collisions.slice(0, 24),
          result.collisions.length > 24
            ? `${result.collisions.length - 24} more collision(s) not shown.`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      )
      lens.notify("Field-name conversion has key collisions.")
      return
    }

    setOutputJson(formatted)
    setActiveTool(null)
    clearDiffResult()
    lens.notify(`Converted field names to ${getKeyCaseLabel(mode)}.`)
  }

  function compareJsonDocuments() {
    if (disableLargeCompare) {
      lens.notify("Compare is disabled for large JSON in this interactive view.")
      return
    }

    const left = parseJson(lens.jsonInput)
    if (left.error) {
      setDiffRows([])
      setComparisonSummary(`Source JSON: ${left.error}`)
      return
    }

    const right = parseJson(outputJson)
    if (right.error) {
      setDiffRows([])
      setComparisonSummary(`Output JSON: ${right.error}`)
      return
    }

    const leftSourceMap = buildJsonSourceMap(lens.jsonInput)
    const rightSourceMap = buildJsonSourceMap(outputJson)
    const nextRows = attachDiffRanges(
      compareJsonValues(left.value, right.value),
      leftSourceMap,
      rightSourceMap
    )

    setDiffRows(nextRows)
    setComparisonSummary(nextRows.length ? "" : "No differences found.")
    lens.notify("JSON comparison complete.")
  }

  function beautifySourceJson() {
    lens.beautifyJson()
    clearDiffResult()
  }

  function minifySourceJson() {
    lens.minifyJson()
    clearDiffResult()
  }

  async function copySourceJson() {
    await copyText(lens.jsonInput)
    lens.notify("Source JSON copied.")
  }

  function clearSourceJson() {
    lens.setJsonInput("")
    setValidationReport(null)
    setExtractionResult(null)
    clearDiffResult()
  }

  function beautifyOutputJson() {
    formatLocalJson(outputJson, setOutputJson, "Output JSON beautified.", true)
  }

  function minifyOutputJson() {
    formatLocalJson(outputJson, setOutputJson, "Output JSON minified.", false)
  }

  async function copyOutputJson() {
    await copyText(outputJson)
    lens.notify("Output JSON copied.")
  }

  function clearOutputJson() {
    setOutputJson("")
    clearDiffResult()
  }

  function toggleActiveTool(tool: Exclude<ActiveJsonTool, null>) {
    setActiveTool((current) => (current === tool ? null : tool))
    setActiveMarkerId(undefined)
  }

  function formatLocalJson(
    input: string,
    setValue: (value: string) => void,
    successMessage: string,
    pretty: boolean
  ) {
    if (new Blob([input]).size >= RIGHT_INPUT_LIMIT_BYTES) {
      lens.notify("This operation is disabled for large JSON.")
      return
    }

    const result = parseJson(input)
    if (result.error) {
      lens.notify("Fix this JSON before formatting it.")
      return
    }

    setValue(
      pretty
        ? stringifyPretty(result.value, lens.indentationWidth)
        : JSON.stringify(result.value)
    )
    clearDiffResult()
    lens.notify(successMessage)
  }

  function transformLocalJson(
    input: string,
    setValue: (value: string) => void,
    mode: JsonTransformMode
  ) {
    if (new Blob([input]).size >= RIGHT_INPUT_LIMIT_BYTES) {
      lens.notify("This operation is disabled for large JSON.")
      return
    }

    const result = transformJsonText(input, mode)

    if (result.error) {
      lens.notify(result.error)
      return
    }

    setValue(result.output)
    clearDiffResult()
    lens.notify(`${getJsonTransformLabel(mode)} complete.`)
  }

  const toolsPanel = (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2 text-xs text-muted-foreground">
          <FileJsonIcon className="size-3.5" />
          <span className="font-medium text-foreground">JSON tools</span>
        </div>
        <Badge
          variant={lens.largeInputWarning ? "destructive" : "secondary"}
          className="h-7 rounded-full px-2 text-xs"
        >
          {lens.inputSizeLabel}
        </Badge>
        {lens.largeDataMode && lens.isProcessing ? (
          <Badge variant="outline" className="h-7 rounded-full px-2 text-xs">
            {lens.processingProgressLabel}
          </Badge>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className={TOOL_CHIP_CLASS}
              disabled={disableLargeLeftOperation}
              title="Convert source JSON field names into output JSON"
            >
              <CaseSensitiveIcon data-icon="inline-start" />
              Convert Fields
              <ChevronDownIcon data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Field-name case</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {KEY_CASE_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.mode}
                onSelect={() => runKeyCaseConversion(option.mode)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          className={TOOL_CHIP_CLASS}
          title="Compare Source JSON against Output JSON"
          disabled={!outputJson.trim() || disableLargeCompare}
          onClick={compareJsonDocuments}
        >
          <BracesIcon data-icon="inline-start" />
          Diff
        </Button>
        <Button
          type="button"
          variant={activeTool === "extract" ? "secondary" : "outline"}
          size="sm"
          className={cn(
            TOOL_CHIP_CLASS,
            activeTool === "extract" && "border-primary/50 bg-primary/10 text-primary"
          )}
          title="Open advanced JSON extraction"
          aria-pressed={activeTool === "extract"}
          onClick={() => toggleActiveTool("extract")}
        >
          <BracketsIcon data-icon="inline-start" />
          Extract
        </Button>
        <Button
          type="button"
          variant={activeTool === "validate" ? "secondary" : "outline"}
          size="sm"
          className={cn(
            TOOL_CHIP_CLASS,
            activeTool === "validate" && "border-primary/50 bg-primary/10 text-primary"
          )}
          title="Open JSON validation and repair"
          aria-pressed={activeTool === "validate"}
          onClick={() => toggleActiveTool("validate")}
        >
          <FileCheck2Icon data-icon="inline-start" />
          Validate
        </Button>
      </CardContent>
    </Card>
  )

  const leftEditor = (
    <Card size="sm">
      <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
        <CardTitle className="flex items-center gap-2">
          <BracesIcon className="size-4" />
          Source JSON
        </CardTitle>
        <JsonEditorActions
          disabled={disableLargeLeftOperation}
          hasValue={Boolean(lens.jsonInput.trim())}
          onBeautify={beautifySourceJson}
          onCopy={copySourceJson}
          onMinify={minifySourceJson}
          onClear={clearSourceJson}
          onTransform={(mode) =>
            transformLocalJson(lens.jsonInput, lens.setJsonInput, mode)
          }
        />
      </CardHeader>
      <CardContent>
        <JsonCodeEditor
          aria-label="Source JSON editor"
          activeMarkerId={activeMarkerId}
          markers={sourceEditorMarkers}
          value={lens.jsonInput}
          onContextCopy={lens.notify}
          onChange={(value) => {
            lens.setJsonInput(value)
            setValidationReport(null)
            setExtractionResult(null)
            setActiveJsonPath(undefined)
            clearDiffResult()
          }}
        />
      </CardContent>
    </Card>
  )

  const rightPanel = (
    <Card size="sm">
      <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
        <CardTitle className="flex items-center gap-2">
          <FileJsonIcon className="size-4" />
          Output JSON
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <JsonEditorActions
            disabled={disableLargeOutputOperation}
            hasValue={Boolean(outputJson.trim())}
            onBeautify={beautifyOutputJson}
            onCopy={copyOutputJson}
            onMinify={minifyOutputJson}
            onClear={clearOutputJson}
            onTransform={(mode) =>
              transformLocalJson(outputJson, setOutputJson, mode)
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Close and clear Output JSON"
            title="Close and clear Output JSON"
            onClick={clearOutputJson}
          >
            <XIcon />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <JsonCodeEditor
          aria-label="Output JSON editor"
          activeMarkerId={activeMarkerId}
          markers={outputEditorMarkers}
          placeholder="Paste a second JSON here, or generate output from a top operation."
          value={outputJson}
          onContextCopy={lens.notify}
          onChange={(value) => {
            setOutputJson(value)
            clearDiffResult()
          }}
        />
      </CardContent>
    </Card>
  )

  const activeToolPanel =
    activeTool === "extract" ? (
      <FieldValueExtractor
        sourceJson={lens.jsonInput}
        result={extractionResult}
        notify={lens.notify}
        onClose={() => setActiveTool(null)}
        onResultChange={setExtractionResult}
      />
    ) : activeTool === "validate" ? (
      <ValidationRepairPanel
        sourceJson={lens.jsonInput}
        report={validationReport}
        notify={lens.notify}
        onClose={() => setActiveTool(null)}
        onReportChange={setValidationReport}
      />
    ) : null

  const contextualRightPanel =
    activeTool === "extract" && extractionResult ? (
      <FieldExtractionResultPanel result={extractionResult} notify={lens.notify} />
    ) : activeTool === "validate" && validationReport ? (
      <ValidationReportPanel
        sourceJson={lens.jsonInput}
        report={validationReport}
        notify={lens.notify}
        onApplyRepair={(repairedJson) => {
          lens.setJsonInput(repairedJson)
          setValidationReport(null)
          setExtractionResult(null)
          clearDiffResult()
        }}
        onSelectIssue={(issue) => setActiveMarkerId(`validation-${issue.id}`)}
      />
    ) : activeTool === null && outputJson.trim() ? (
      rightPanel
    ) : null

  return (
    <section className="space-y-4">
      <SourceManagementPanel />
      <JsonNavigationPanel
        activePath={activeJsonPath}
        indentationWidth={lens.indentationWidth}
        isLargeDataMode={lens.largeDataMode}
        jsonInput={lens.jsonInput}
        notify={lens.notify}
        onIndentationWidthChange={lens.setIndentationWidth}
        onSelectPath={selectJsonPath}
      />
      {toolsPanel}
      {activeToolPanel}
      <div className={cn("grid gap-4", contextualRightPanel && "xl:grid-cols-2")}>
        {leftEditor}
        {contextualRightPanel}
      </div>
      {comparisonSummary || diffRows.length ? (
        <DiffResultTable
          activeTags={activeDiffTags}
          counts={diffTagCounts}
          filteredRows={filteredDiffRows}
          message={comparisonSummary}
          rows={diffRows}
          onSelectRow={(row) => setActiveMarkerId(`diff-${row.id}`)}
          onToggleTag={toggleDiffTag}
        />
      ) : null}
    </section>
  )
}

function DiffResultTable({
  activeTags,
  counts,
  filteredRows,
  message,
  rows,
  onToggleTag,
  onSelectRow,
}: {
  activeTags: Set<JsonDiffKind>
  counts: Record<JsonDiffKind, number>
  filteredRows: JsonDiffRow[]
  message: string
  rows: JsonDiffRow[]
  onSelectRow: (row: JsonDiffRow) => void
  onToggleTag: (kind: JsonDiffKind) => void
}) {
  const showingAll = activeTags.size === 0

  return (
    <Card size="sm">
      <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
        <CardTitle className="flex items-center gap-2">
          <BracesIcon className="size-4" />
          Diff result
        </CardTitle>
        {rows.length ? (
          <Badge variant="secondary" className="h-7 rounded-full px-2 text-xs">
            {filteredRows.length.toLocaleString()} of {rows.length.toLocaleString()}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length ? (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {DIFF_TAGS.map((tag) => {
                const active = activeTags.has(tag.kind)

                return (
                  <Button
                    key={tag.kind}
                    type="button"
                    variant={active ? "secondary" : "outline"}
                    size="sm"
                    className={cn(
                      TOOL_CHIP_CLASS,
                      "gap-1.5",
                      active && "border-primary/50 bg-primary/10 text-primary"
                    )}
                    title={tag.title}
                    aria-pressed={active}
                    onClick={() => onToggleTag(tag.kind)}
                  >
                    {tag.label}
                    <Badge
                      variant="secondary"
                      className="h-5 min-w-5 rounded-full px-1 text-[11px]"
                    >
                      {counts[tag.kind].toLocaleString()}
                    </Badge>
                  </Button>
                )
              })}
              {!showingAll ? (
                <span className="text-xs text-muted-foreground">
                  Showing selected diff types
                </span>
              ) : null}
            </div>
            <div className="max-h-96 overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-36">Tag</TableHead>
                    <TableHead className="min-w-64">Path</TableHead>
                    <TableHead className="min-w-64">Source value</TableHead>
                    <TableHead className="min-w-64">Output value</TableHead>
                    <TableHead className="w-28">Source type</TableHead>
                    <TableHead className="w-28">Output type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.length ? (
                    filteredRows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        title="Jump to this diff in the JSON editors"
                        onClick={() => onSelectRow(row)}
                      >
                        <TableCell>
                          <Badge variant="outline" className="rounded-full">
                            {getDiffTagLabel(row.kind)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.path}</TableCell>
                        <TableCell className="max-w-80 font-mono text-xs whitespace-pre-wrap">
                          {row.leftValue}
                        </TableCell>
                        <TableCell className="max-w-80 font-mono text-xs whitespace-pre-wrap">
                          {row.rightValue}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.leftType}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {row.rightType}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-24 text-center text-sm text-muted-foreground"
                      >
                        No diffs match the selected tags.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <pre className="max-h-80 overflow-auto rounded-lg border bg-muted p-3 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
            {message}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

function JsonEditorActions({
  disabled,
  hasValue,
  onBeautify,
  onClear,
  onCopy,
  onMinify,
  onTransform,
}: {
  disabled: boolean
  hasValue: boolean
  onBeautify: () => void
  onClear: () => void
  onCopy: () => void | Promise<void>
  onMinify: () => void
  onTransform: (mode: JsonTransformMode) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        variant="secondary"
        size="sm"
        className={TOOL_CHIP_CLASS}
        title="Format this JSON with indentation"
        disabled={disabled || !hasValue}
        onClick={onBeautify}
      >
        <Wand2Icon data-icon="inline-start" />
        Beautify
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={TOOL_CHIP_CLASS}
        title="Remove whitespace from this JSON"
        disabled={disabled || !hasValue}
        onClick={onMinify}
      >
        <WrapTextIcon data-icon="inline-start" />
        Minify
      </Button>
      <Button
        variant="outline"
        size="sm"
        className={TOOL_CHIP_CLASS}
        title="Copy this JSON"
        disabled={!hasValue}
        onClick={onCopy}
      >
        <ClipboardIcon data-icon="inline-start" />
        Copy
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={TOOL_CHIP_CLASS}
            title="Run a JSON transform on this editor"
            disabled={disabled || !hasValue}
          >
            <BracesIcon data-icon="inline-start" />
            Transform
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>JSON transform</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {JSON_TRANSFORM_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={option.mode}
              onSelect={() => onTransform(option.mode)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="destructive"
        size="sm"
        className={TOOL_CHIP_CLASS}
        title="Clear this JSON"
        disabled={!hasValue}
        onClick={onClear}
      >
        <EraserIcon data-icon="inline-start" />
        Clear
      </Button>
    </div>
  )
}

function getJsonTransformLabel(mode: JsonTransformMode) {
  return JSON_TRANSFORM_OPTIONS.find((option) => option.mode === mode)?.label ?? mode
}

function createValidationMarkers(
  report: JsonValidationReport | null
): JsonEditorMarker[] {
  if (!report) return []

  return report.issues.map((issue) => ({
    id: `validation-${issue.id}`,
    kind:
      issue.severity === "error" ? "validation-error" : "validation-warning",
    from: issue.offset,
    to: issue.offset + Math.max(1, issue.length),
    message: `${issue.line}:${issue.column} ${issue.message}`,
  }))
}

function createDiffMarkers(
  rows: JsonDiffRow[],
  side: "left" | "right"
): JsonEditorMarker[] {
  return rows.flatMap((row) => {
    const range = side === "left" ? row.leftRange : row.rightRange
    if (!range) return []

    return [
      {
        id: `diff-${row.id}`,
        kind: getEditorDiffMarkerKind(row.kind),
        from: range.from,
        to: range.to,
        message: `${getDiffTagLabel(row.kind)} at ${row.path}`,
      },
    ]
  })
}

function createNavigationMarkers(
  sourceJson: string,
  activePath: string | undefined
): JsonEditorMarker[] {
  if (!activePath) return []

  const sourceMap = buildJsonSourceMap(sourceJson)
  const range = sourceMap?.ranges.get(activePath)?.valueRange
  if (!range) return []

  return [
    {
      id: `navigation-${activePath}`,
      kind: "navigation-match",
      from: range.from,
      to: range.to,
      message: activePath,
    },
  ]
}

function getEditorDiffMarkerKind(
  kind: JsonDiffKind
): JsonEditorMarker["kind"] {
  if (kind === "left-only") return "diff-removed"
  if (kind === "right-only") return "diff-added"
  if (kind === "type") return "diff-type"
  if (kind === "null") return "diff-null"
  if (kind === "array-count") return "diff-array-count"
  return "diff-changed"
}

function attachDiffRanges(
  rows: JsonDiffRow[],
  leftSourceMap: JsonSourceMap | null,
  rightSourceMap: JsonSourceMap | null
): JsonDiffRow[] {
  return rows.map((row) => ({
    ...row,
    leftRange: getDiffRange(row, leftSourceMap, "left"),
    rightRange: getDiffRange(row, rightSourceMap, "right"),
  }))
}

function getDiffRange(
  row: JsonDiffRow,
  sourceMap: JsonSourceMap | null,
  side: "left" | "right"
) {
  if (!sourceMap) return undefined
  if (side === "left" && row.kind === "right-only") return undefined
  if (side === "right" && row.kind === "left-only") return undefined

  const pathRange = sourceMap.ranges.get(row.path)
  const rangeMode =
    row.kind === "left-only" || row.kind === "right-only" ? "property" : "value"

  return getRangeForDiffKind(pathRange, rangeMode)
}

function transformJsonText(input: string, mode: JsonTransformMode) {
  const parsed = parseJson(input)

  if (parsed.error) {
    return { output: input, error: "Fix this JSON before transforming it." }
  }

  if (mode === "stringify") {
    return {
      output: JSON.stringify(JSON.stringify(parsed.value)),
      error: null,
    }
  }

  if (mode === "unstringify") {
    if (typeof parsed.value !== "string") {
      return {
        output: input,
        error: "Unstringify expects the editor to contain a JSON string.",
      }
    }

    const inner = parseJson(parsed.value)

    if (inner.error) {
      return {
        output: input,
        error: "The string contents are not valid JSON.",
      }
    }

    return { output: stringifyPretty(inner.value), error: null }
  }

  if (mode === "sort-keys") {
    return { output: stringifyPretty(sortJsonKeys(parsed.value)), error: null }
  }

  if (mode === "flatten") {
    const flattened = flattenJsonValue(parsed.value)

    if (flattened.collisions.length) {
      return {
        output: input,
        error: `Flatten blocked because ${flattened.collisions.length} path collision(s) were found.`,
      }
    }

    return { output: stringifyPretty(flattened.value), error: null }
  }

  const unflattened = unflattenJsonValue(parsed.value)

  if (unflattened.error) {
    return { output: input, error: unflattened.error }
  }

  return { output: stringifyPretty(unflattened.value), error: null }
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

function flattenJsonValue(value: unknown) {
  const flattened = createSafeRecord()
  const collisions: string[] = []

  function write(path: string, item: unknown) {
    if (Object.prototype.hasOwnProperty.call(flattened, path)) {
      collisions.push(path)
      return
    }

    flattened[path] = item
  }

  function walk(item: unknown, path: string) {
    if (Array.isArray(item)) {
      if (item.length === 0) {
        if (path) write(path, [])
        return
      }

      item.forEach((child, index) => walk(child, `${path}[${index}]`))
      return
    }

    if (isRecord(item)) {
      const entries = Object.entries(item)

      if (entries.length === 0) {
        if (path) write(path, createSafeRecord())
        return
      }

      for (const [key, child] of entries) {
        walk(child, appendJsonPath(path, key))
      }

      return
    }

    write(path || "value", item)
  }

  if (Array.isArray(value) && value.length === 0) {
    return { value, collisions }
  }

  walk(value, "")

  return { value: flattened, collisions }
}

function unflattenJsonValue(value: unknown): { value: unknown; error: string | null } {
  if (!isRecord(value)) {
    return {
      value,
      error: "Unflatten expects an object with flattened path keys.",
    }
  }

  const entries = Object.entries(value)
  if (!entries.length) return { value: createSafeRecord(), error: null }

  const firstTokens = parseFlattenedPath(entries[0][0])
  if (!firstTokens?.length) {
    return { value, error: `Invalid flattened path: ${entries[0][0]}` }
  }

  const root: unknown[] | Record<string, unknown> =
    typeof firstTokens[0] === "number" ? [] : createSafeRecord()

  for (const [path, item] of entries) {
    const tokens = parseFlattenedPath(path)

    if (!tokens?.length) {
      return { value, error: `Invalid flattened path: ${path}` }
    }

    const error = assignUnflattenedPath(root, tokens, item)
    if (error) return { value, error }
  }

  return { value: root, error: null }
}

function assignUnflattenedPath(
  root: unknown[] | Record<string, unknown>,
  tokens: Array<string | number>,
  value: unknown
) {
  let current: unknown = root

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    const isLast = index === tokens.length - 1

    if (Array.isArray(current)) {
      if (typeof token !== "number") {
        return `Path ${tokens.join(".")} expects an array index.`
      }

      if (isLast) {
        if (current[token] !== undefined) return `Path collision at ${tokens.join(".")}.`
        current[token] = value
        return null
      }

      current[token] ??= typeof tokens[index + 1] === "number" ? [] : createSafeRecord()
      current = current[token]
      continue
    }

    if (!isRecord(current) || typeof token !== "string") {
      return `Path ${tokens.join(".")} cannot be reconstructed safely.`
    }

    if (isLast) {
      if (Object.prototype.hasOwnProperty.call(current, token)) {
        return `Path collision at ${tokens.join(".")}.`
      }

      current[token] = value
      return null
    }

    current[token] ??= typeof tokens[index + 1] === "number" ? [] : createSafeRecord()
    current = current[token]
  }

  return null
}

function appendJsonPath(path: string, key: string) {
  const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    ? key
    : `[${JSON.stringify(key)}]`

  if (!path) return segment
  return segment.startsWith("[") ? `${path}${segment}` : `${path}.${segment}`
}

function parseFlattenedPath(path: string) {
  const tokens: Array<string | number> = []
  let index = 0

  while (index < path.length) {
    const char = path[index]

    if (char === ".") {
      index += 1
      continue
    }

    if (char === "[") {
      const closingIndex = findPathBracketClose(path, index)
      if (closingIndex < 0) return null

      const content = path.slice(index + 1, closingIndex)
      if (/^\d+$/.test(content)) {
        tokens.push(Number(content))
      } else {
        try {
          const parsed = JSON.parse(content) as unknown
          if (typeof parsed !== "string") return null
          tokens.push(parsed)
        } catch {
          return null
        }
      }

      index = closingIndex + 1
      continue
    }

    let end = index
    while (end < path.length && path[end] !== "." && path[end] !== "[") {
      end += 1
    }

    const segment = path.slice(index, end)
    if (!segment) return null
    tokens.push(segment)
    index = end
  }

  return tokens
}

function findPathBracketClose(path: string, startIndex: number) {
  let inString = false
  let escaped = false

  for (let index = startIndex + 1; index < path.length; index += 1) {
    const char = path[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === "\"") {
        inString = false
      }

      continue
    }

    if (char === "\"") {
      inString = true
      continue
    }

    if (char === "]") return index
  }

  return -1
}

function createSafeRecord() {
  return Object.create(null) as Record<string, unknown>
}

function getKeyCaseLabel(mode: KeyCaseMode) {
  return KEY_CASE_OPTIONS.find((option) => option.mode === mode)?.label ?? mode
}

function convertJsonKeys(value: unknown, mode: KeyCaseMode) {
  const collisions: string[] = []

  function walk(item: unknown, path: string): unknown {
    if (Array.isArray(item)) {
      return item.map((child, index) => walk(child, `${path}[${index}]`))
    }

    if (!isRecord(item)) return item

    const next = createSafeRecord()

    for (const [key, child] of Object.entries(item)) {
      const nextKey = formatKeyName(key, mode)
      const childPath = `${path}.${key}`

      if (Object.prototype.hasOwnProperty.call(next, nextKey)) {
        collisions.push(`${childPath} -> ${nextKey}`)
      }

      next[nextKey] = walk(child, childPath)
    }

    return next
  }

  return { value: walk(value, "$"), collisions }
}

function formatKeyName(key: string, mode: KeyCaseMode) {
  const words = splitKeyWords(key)
  if (!words.length) return key

  if (mode === "camel") {
    return [words[0], ...words.slice(1).map(capitalizeWord)].join("")
  }
  if (mode === "pascal") return words.map(capitalizeWord).join("")
  if (mode === "snake") return words.join("_")
  if (mode === "kebab") return words.join("-")
  if (mode === "upper") return words.join("_").toUpperCase()
  return words.join("").toLowerCase()
}

function splitKeyWords(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.toLowerCase())
}

function capitalizeWord(word: string) {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`
}

function compareJsonValues(left: unknown, right: unknown) {
  const rows: JsonDiffRow[] = []

  walkJsonDiff(left, right, "$", rows)

  return rows.map((row, index) => ({ ...row, id: `${row.kind}:${row.path}:${index}` }))
}

function walkJsonDiff(
  left: unknown,
  right: unknown,
  path: string,
  rows: JsonDiffRow[]
) {
  if (Array.isArray(left) && Array.isArray(right)) {
    const maxLength = Math.max(left.length, right.length)
    const minLength = Math.min(left.length, right.length)

    if (left.length !== right.length) {
      rows.push(
        createDiffRow({
          kind: "array-count",
          path,
          left,
          right,
          leftValue: formatArrayCount(left.length),
          rightValue: formatArrayCount(right.length),
        })
      )
    }

    for (let index = 0; index < minLength; index += 1) {
      const childPath = `${path}[${index}]`
      walkJsonDiff(left[index], right[index], childPath, rows)
    }

    for (let index = minLength; index < maxLength; index += 1) {
      const childPath = `${path}[${index}]`

      if (index >= left.length) {
        rows.push(
          createDiffRow({
            kind: "right-only",
            path: childPath,
            leftType: "missing",
            leftValue: "missing",
            right: right[index],
          })
        )
      } else {
        rows.push(
          createDiffRow({
            kind: "left-only",
            path: childPath,
            left: left[index],
            rightType: "missing",
            rightValue: "missing",
          })
        )
      }
    }

    return
  }

  if (isRecord(left) && isRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])

    for (const key of keys) {
      const childPath = appendJsonPath(path, key)
      const hasLeft = Object.prototype.hasOwnProperty.call(left, key)
      const hasRight = Object.prototype.hasOwnProperty.call(right, key)

      if (!hasLeft) {
        rows.push(
          createDiffRow({
            kind: "right-only",
            path: childPath,
            leftType: "missing",
            leftValue: "missing",
            right: right[key],
          })
        )
      } else if (!hasRight) {
        rows.push(
          createDiffRow({
            kind: "left-only",
            path: childPath,
            left: left[key],
            rightType: "missing",
            rightValue: "missing",
          })
        )
      } else {
        walkJsonDiff(left[key], right[key], childPath, rows)
      }
    }

    return
  }

  const leftType = getJsonValueType(left)
  const rightType = getJsonValueType(right)

  if (leftType !== rightType) {
    rows.push(
      createDiffRow({
        kind: leftType === "null" || rightType === "null" ? "null" : "type",
        path,
        left,
        right,
      })
    )
    return
  }

  if (!Object.is(left, right)) {
    rows.push(
      createDiffRow({
        kind: "changed",
        path,
        left,
        right,
      })
    )
  }
}

function createDiffRow({
  kind,
  path,
  left,
  right,
  leftType,
  rightType,
  leftValue,
  rightValue,
}: {
  kind: JsonDiffKind
  path: string
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
    leftValue: leftValue ?? formatDiffValue(left),
    rightValue: rightValue ?? formatDiffValue(right),
    leftType: leftType ?? getJsonValueType(left),
    rightType: rightType ?? getJsonValueType(right),
  }
}

function countDiffTags(rows: JsonDiffRow[]) {
  const counts = Object.fromEntries(
    DIFF_TAGS.map((tag) => [tag.kind, 0])
  ) as Record<JsonDiffKind, number>

  for (const row of rows) {
    counts[row.kind] += 1
  }

  return counts
}

function getDiffTagLabel(kind: JsonDiffKind) {
  return DIFF_TAGS.find((tag) => tag.kind === kind)?.label ?? kind
}

function getJsonValueType(value: unknown): JsonValueType {
  if (Array.isArray(value)) return "array"
  if (value === null) return "null"
  if (isRecord(value)) return "object"

  const valueType = typeof value
  if (valueType === "boolean") return "boolean"
  if (valueType === "number") return "number"
  if (valueType === "string") return "string"

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
