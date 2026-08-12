"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  BracketsIcon,
  ClipboardIcon,
  DownloadIcon,
  HistoryIcon,
  LoaderCircleIcon,
  SaveIcon,
  SearchCodeIcon,
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type {
  FieldExtractionLimit,
  FieldExtractionMode,
} from "@/lib/json-field-extraction"
import type {
  FieldExtractionResponse,
  SerializedFieldGroup,
} from "@/lib/json-field-extraction.worker"
import { copyText, downloadText } from "@/lib/json-lens"

export type FieldExtractionResult = {
  combinedJson: string
  groups: SerializedFieldGroup[]
  limit: FieldExtractionLimit
  mode: FieldExtractionMode
  query: string
  totalMatches: number
}

type SavedExtractionQuery = {
  id: string
  limit: FieldExtractionLimit
  mode: FieldExtractionMode
  query: string
}

type FieldValueExtractorProps = {
  sourceJson: string
  result: FieldExtractionResult | null
  notify: (message: string) => void
  onClose: () => void
  onResultChange: (result: FieldExtractionResult | null) => void
}

export function FieldValueExtractor({
  sourceJson,
  result,
  notify,
  onClose,
  onResultChange,
}: FieldValueExtractorProps) {
  const [mode, setMode] = useState<FieldExtractionMode>("field")
  const [limit, setLimit] = useState<FieldExtractionLimit>("all")
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [isExtracting, setIsExtracting] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedExtractionQuery[]>([])
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const previousSourceRef = useRef(sourceJson)
  const onResultChangeRef = useRef(onResultChange)

  useEffect(() => {
    onResultChangeRef.current = onResultChange
  }, [onResultChange])

  useEffect(() => {
    queueMicrotask(() => setSavedQueries(readSavedExtractionQueries()))
  }, [])

  useEffect(() => {
    if (previousSourceRef.current === sourceJson) return

    previousSourceRef.current = sourceJson
    requestIdRef.current += 1
    workerRef.current?.terminate()
    workerRef.current = null
    setIsExtracting(false)
    setError("")
    onResultChangeRef.current(null)
  }, [sourceJson])

  useEffect(() => () => workerRef.current?.terminate(), [])

  function extractValues(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      setError(getEmptyQueryError(mode))
      return
    }

    if (!sourceJson.trim()) {
      setError("Paste Source JSON before extracting values.")
      return
    }

    workerRef.current?.terminate()
    const worker = new Worker(
      new URL("../../lib/json-field-extraction.worker.ts", import.meta.url),
      { type: "module" }
    )
    const requestId = requestIdRef.current + 1

    requestIdRef.current = requestId
    workerRef.current = worker
    setIsExtracting(true)
    setError("")
    onResultChange(null)

    worker.onmessage = (workerEvent: MessageEvent<FieldExtractionResponse>) => {
      const response = workerEvent.data
      if (response.requestId !== requestIdRef.current) return

      setIsExtracting(false)
      worker.terminate()
      workerRef.current = null

      if (!response.ok) {
        setError(response.error)
        notify("Field extraction could not be completed.")
        return
      }

      onResultChange({ ...response, limit, mode, query: normalizedQuery })
      notify(
        response.totalMatches
          ? `Extracted ${response.totalMatches.toLocaleString()} value(s).`
          : `No values matched "${normalizedQuery}".`
      )
    }

    worker.onerror = (workerEvent) => {
      if (requestId !== requestIdRef.current) return

      setIsExtracting(false)
      setError(workerEvent.message || "Could not extract field values.")
      worker.terminate()
      workerRef.current = null
    }

    worker.postMessage({
      input: sourceJson,
      limit,
      mode,
      query: normalizedQuery,
      requestId,
    })
  }

  function changeMode(nextMode: string) {
    setMode(nextMode as FieldExtractionMode)
    setQuery(getDefaultQuery(nextMode as FieldExtractionMode))
    setError("")
    onResultChange(null)
  }

  function saveCurrentQuery() {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      setError(getEmptyQueryError(mode))
      return
    }

    const nextQuery: SavedExtractionQuery = {
      id: createSavedQueryId(),
      limit,
      mode,
      query: normalizedQuery,
    }
    const nextQueries = [
      nextQuery,
      ...savedQueries.filter(
        (item) =>
          item.mode !== nextQuery.mode ||
          item.limit !== nextQuery.limit ||
          item.query !== nextQuery.query
      ),
    ].slice(0, 12)

    setSavedQueries(nextQueries)
    writeSavedExtractionQueries(nextQueries)
    notify("Extraction query saved.")
  }

  function loadSavedQuery(savedQuery: SavedExtractionQuery) {
    setMode(savedQuery.mode)
    setLimit(savedQuery.limit)
    setQuery(savedQuery.query)
    setError("")
    onResultChange(null)
    notify("Saved extraction query loaded.")
  }

  return (
    <Card size="sm">
      <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
        <div className="space-y-0.5">
          <CardTitle className="flex items-center gap-2">
            <BracketsIcon className="size-4" />
            Extraction tool
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Match exact field names or target nested values with a JSON path.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close extraction tool"
          title="Close extraction tool"
          onClick={onClose}
        >
          <XIcon />
        </Button>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3" onSubmit={extractValues}>
          <Tabs value={mode} onValueChange={changeMode}>
            <TabsList aria-label="Extraction mode" className="flex-wrap">
              <TabsTrigger value="field" disabled={isExtracting}>
                Exact field
              </TabsTrigger>
              <TabsTrigger value="path" disabled={isExtracting}>
                Path
              </TabsTrigger>
              <TabsTrigger value="contains-key" disabled={isExtracting}>
                Parent key
              </TabsTrigger>
              <TabsTrigger value="predicate" disabled={isExtracting}>
                Filter
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className="sm:max-w-xl"
              aria-label={getQueryLabel(mode)}
              placeholder={getQueryPlaceholder(mode)}
              disabled={isExtracting}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setError("")
                onResultChange(null)
              }}
            />
            <Select
              value={limit}
              onValueChange={(value) => setLimit(value as FieldExtractionLimit)}
            >
              <SelectTrigger
                size="sm"
                className="h-8 sm:w-32"
                title="Choose whether extraction returns all matches or only the first match"
                disabled={isExtracting}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All matches</SelectItem>
                <SelectItem value="first">First match</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="submit"
              size="sm"
              className="active:!translate-y-0"
              disabled={isExtracting || !sourceJson.trim()}
              title="Extract matching values from Source JSON"
            >
              {isExtracting ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <SearchCodeIcon data-icon="inline-start" />
              )}
              {isExtracting ? "Extracting" : result ? "Extract Again" : "Extract"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 active:!translate-y-0"
              title="Save this extraction query"
              disabled={isExtracting || !query.trim()}
              onClick={saveCurrentQuery}
            >
              <SaveIcon data-icon="inline-start" />
              Save
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 active:!translate-y-0"
                  title="Load a saved extraction query"
                  disabled={isExtracting || !savedQueries.length}
                >
                  <HistoryIcon data-icon="inline-start" />
                  Saved
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Saved extraction queries</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {savedQueries.map((savedQuery) => (
                  <DropdownMenuItem
                    key={savedQuery.id}
                    className="flex flex-col items-start gap-1"
                    onSelect={() => loadSavedQuery(savedQuery)}
                  >
                    <span className="font-medium">
                      {getModeLabel(savedQuery.mode)}
                    </span>
                    <span className="max-w-72 truncate font-mono text-xs text-muted-foreground">
                      {savedQuery.query}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {mode !== "field" ? (
            <p className="text-xs text-muted-foreground">
              {getModeHelp(mode)}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  )
}

export function FieldExtractionResultPanel({
  result,
  notify,
}: {
  result: FieldExtractionResult
  notify: (message: string) => void
}) {
  async function copyAllValues() {
    await copyText(result.combinedJson)
    notify("Extracted values copied.")
  }

  function exportAllValues() {
    downloadText(
      "json-lens-query-result.json",
      result.combinedJson,
      "application/json"
    )
    notify("Extraction result exported.")
  }

  async function copyGroup(group: SerializedFieldGroup) {
    await copyText(group.json)
    notify(`Values from ${group.path} copied.`)
  }

  return (
    <Card size="sm">
      <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="flex items-center gap-2">
            <BracketsIcon className="size-4" />
            Extraction result
          </CardTitle>
          <p className="truncate font-mono text-xs text-muted-foreground" title={result.query}>
            {result.query}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2 text-xs active:!translate-y-0"
            title="Copy all extracted values"
            onClick={copyAllValues}
          >
            <ClipboardIcon data-icon="inline-start" />
            Copy all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2 text-xs active:!translate-y-0"
            title="Export extracted values as JSON"
            onClick={exportAllValues}
          >
            <DownloadIcon data-icon="inline-start" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{result.totalMatches.toLocaleString()} matches</Badge>
          <Badge variant="outline">{getModeLabel(result.mode)}</Badge>
          <Badge variant="outline">
            {result.limit === "first" ? "First match" : "All matches"}
          </Badge>
        </div>
        {result.groups.length ? (
          <div className="divide-y rounded-lg border">
            {result.groups.map((group) => (
              <section key={group.path} className="space-y-2 p-3 [content-visibility:auto]">
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <code className="truncate text-xs font-medium" title={group.path}>
                    {group.path}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    title={`Copy values from ${group.path}`}
                    aria-label={`Copy values from ${group.path}`}
                    onClick={() => copyGroup(group)}
                  >
                    <ClipboardIcon />
                  </Button>
                </div>
                {group.items.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.slice(0, 8).map((item) => (
                      <Badge
                        key={item.path}
                        variant="secondary"
                        className="max-w-72 truncate rounded-full px-2 font-mono text-[11px]"
                        title={item.path}
                      >
                        {item.path}
                      </Badge>
                    ))}
                    {group.items.length > 8 ? (
                      <Badge variant="outline" className="rounded-full px-2 text-[11px]">
                        +{group.items.length - 8} more
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                <pre className="max-h-[34rem] overflow-auto bg-muted p-3 font-mono text-xs leading-5 whitespace-pre-wrap">
                  {group.json}
                </pre>
              </section>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No values matched this extraction query.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function getDefaultQuery(mode: FieldExtractionMode) {
  if (mode === "path") return "$"
  if (mode === "predicate") return "status = active"
  return ""
}

function getEmptyQueryError(mode: FieldExtractionMode) {
  if (mode === "path") return "Enter a JSON path to extract."
  if (mode === "contains-key") return "Enter a key to find parent objects."
  if (mode === "predicate") return "Enter a filter predicate."
  return "Enter an exact field name to extract."
}

function getQueryLabel(mode: FieldExtractionMode) {
  if (mode === "path") return "JSON path to extract"
  if (mode === "contains-key") {
    return "Key whose parent objects should be extracted"
  }
  if (mode === "predicate") return "Predicate used to filter objects"
  return "Field name to extract"
}

function getQueryPlaceholder(mode: FieldExtractionMode) {
  if (mode === "path") return "$.users[*].profile.email or users[0].name"
  if (mode === "contains-key") return "Exact key, for example: email"
  if (mode === "predicate") return "status = active, age >= 30, email exists"
  return "Exact field name, for example: name"
}

function getModeHelp(mode: FieldExtractionMode) {
  if (mode === "path") {
    return "Supports dot properties, array indexes, wildcards, and quoted bracket keys."
  }
  if (mode === "contains-key") {
    return "Returns parent objects that contain this exact, case-sensitive key."
  }
  return "Filters objects with =, !=, >, >=, <, <=, contains, matches, exists, missing, and null."
}

function getModeLabel(mode: FieldExtractionMode) {
  if (mode === "path") return "JSON path"
  if (mode === "contains-key") return "Parent key"
  if (mode === "predicate") return "Predicate"
  return "Exact field"
}

const SAVED_EXTRACTION_QUERIES_KEY = "json-lens:extraction-queries"

function readSavedExtractionQueries(): SavedExtractionQuery[] {
  if (typeof window === "undefined") return []

  try {
    const raw = window.localStorage.getItem(SAVED_EXTRACTION_QUERIES_KEY)
    if (!raw) return []

    const parsed = JSON.parse(raw) as SavedExtractionQuery[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSavedExtractionQueries(queries: SavedExtractionQuery[]) {
  if (typeof window === "undefined") return

  try {
    window.localStorage.setItem(
      SAVED_EXTRACTION_QUERIES_KEY,
      JSON.stringify(queries)
    )
  } catch {
    // Saved queries are convenience state; extraction must continue if storage is full.
  }
}

function createSavedQueryId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}
