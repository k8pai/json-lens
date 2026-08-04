"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  BracketsIcon,
  ClipboardIcon,
  LoaderCircleIcon,
  SearchCodeIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { copyText } from "@/lib/json-lens"
import type {
  FieldExtractionResponse,
  SerializedFieldGroup,
} from "@/lib/json-field-extraction.worker"

type ExtractionResult = {
  combinedJson: string
  groups: SerializedFieldGroup[]
  totalMatches: number
}

export function FieldValueExtractor({
  sourceJson,
  notify,
}: {
  sourceJson: string
  notify: (message: string) => void
}) {
  const [fieldName, setFieldName] = useState("")
  const [result, setResult] = useState<ExtractionResult | null>(null)
  const [error, setError] = useState("")
  const [isExtracting, setIsExtracting] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const previousSourceRef = useRef(sourceJson)

  useEffect(() => {
    if (previousSourceRef.current === sourceJson) return

    previousSourceRef.current = sourceJson
    requestIdRef.current += 1
    workerRef.current?.terminate()
    workerRef.current = null
    setIsExtracting(false)
    setResult(null)
    setError("")
  }, [sourceJson])

  useEffect(() => {
    return () => workerRef.current?.terminate()
  }, [])

  function extractValues(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const normalizedFieldName = fieldName.trim()
    if (!normalizedFieldName) {
      setError("Enter an exact field name to extract.")
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
    setResult(null)

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

      setResult(response)
      notify(
        response.totalMatches
          ? `Extracted ${response.totalMatches.toLocaleString()} field value(s).`
          : `No fields named "${normalizedFieldName}" were found.`
      )
    }

    worker.onerror = (workerEvent) => {
      if (requestId !== requestIdRef.current) return

      setIsExtracting(false)
      setError(workerEvent.message || "Could not extract field values.")
      worker.terminate()
      workerRef.current = null
    }

    worker.postMessage({ fieldName: normalizedFieldName, input: sourceJson, requestId })
  }

  async function copyAllValues() {
    if (!result) return
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
        <div className="space-y-0.5">
          <CardTitle className="flex items-center gap-2">
            <BracketsIcon className="size-4" />
            Extract field values
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Exact, case-sensitive field names are grouped by structural JSON path.
          </p>
        </div>
        {result?.totalMatches ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 rounded-full px-2 text-xs active:!translate-y-0"
            title="Copy all extracted arrays"
            onClick={copyAllValues}
          >
            <ClipboardIcon data-icon="inline-start" />
            Copy all
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={extractValues}>
          <Input
            className="sm:max-w-sm"
            aria-label="Field name to extract"
            placeholder="Field name, for example: name"
            disabled={isExtracting}
            value={fieldName}
            onChange={(event) => {
              setFieldName(event.target.value)
              setResult(null)
              setError("")
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
            {isExtracting ? "Extracting" : "Extract"}
          </Button>
        </form>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {result ? (
          result.groups.length ? (
            <div className="divide-y rounded-lg border">
              {result.groups.map((group) => (
                <section
                  key={group.path}
                  className="space-y-2 p-3 [content-visibility:auto]"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <code className="truncate text-xs font-medium" title={group.path}>
                        {group.path}
                      </code>
                      <Badge variant="secondary" className="rounded-full">
                        {group.count.toLocaleString()}
                      </Badge>
                    </div>
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
                  <pre className="max-h-80 overflow-auto bg-muted p-3 font-mono text-xs leading-5 whitespace-pre-wrap">
                    {group.json}
                  </pre>
                </section>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No fields named <code>{fieldName.trim()}</code> were found.
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}
