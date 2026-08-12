"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  BracketsIcon,
  ClipboardIcon,
  LoaderCircleIcon,
  SearchCodeIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { FieldExtractionMode } from "@/lib/json-field-extraction"
import type {
  FieldExtractionResponse,
  SerializedFieldGroup,
} from "@/lib/json-field-extraction.worker"
import { copyText } from "@/lib/json-lens"

export type FieldExtractionResult = {
  combinedJson: string
  groups: SerializedFieldGroup[]
  mode: FieldExtractionMode
  query: string
  totalMatches: number
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
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [isExtracting, setIsExtracting] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const previousSourceRef = useRef(sourceJson)
  const onResultChangeRef = useRef(onResultChange)

  useEffect(() => {
    onResultChangeRef.current = onResultChange
  }, [onResultChange])

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
      setError(mode === "path" ? "Enter a JSON path to extract." : "Enter an exact field name to extract.")
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

      onResultChange({ ...response, mode, query: normalizedQuery })
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

    worker.postMessage({ mode, query: normalizedQuery, input: sourceJson, requestId })
  }

  function changeMode(nextMode: string) {
    setMode(nextMode as FieldExtractionMode)
    setQuery(nextMode === "path" ? "$" : "")
    setError("")
    onResultChange(null)
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
            <TabsList aria-label="Extraction mode">
              <TabsTrigger value="field" disabled={isExtracting}>
                Exact field
              </TabsTrigger>
              <TabsTrigger value="path" disabled={isExtracting}>
                JSON path
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              className="sm:max-w-xl"
              aria-label={mode === "path" ? "JSON path to extract" : "Field name to extract"}
              placeholder={
                mode === "path"
                  ? "$.users[*].profile.email"
                  : "Exact field name, for example: name"
              }
              disabled={isExtracting}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setError("")
                onResultChange(null)
              }}
            />
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
          </div>
          {mode === "path" ? (
            <p className="text-xs text-muted-foreground">
              Supports dot properties, array indexes, wildcards, and quoted bracket keys.
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
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{result.totalMatches.toLocaleString()} matches</Badge>
          <Badge variant="outline">{result.mode === "path" ? "JSON path" : "Exact field"}</Badge>
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
