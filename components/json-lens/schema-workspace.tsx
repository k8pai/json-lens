"use client"

import { useMemo, useState } from "react"
import {
  ClipboardIcon,
  DownloadIcon,
  FileCode2Icon,
  GitCompareArrowsIcon,
  ListChecksIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  copyText,
  downloadText,
  parseJson,
} from "@/lib/json-lens"
import {
  buildContractBundle,
  compareSchemaDocuments,
  inferJsonSchema,
  type ContractBundle,
} from "@/lib/json-schema-contracts"

import { JsonCodeEditor } from "./json-code-editor"
import { useJsonLens } from "./json-lens-provider"

type ContractOutput = "json-schema" | "typescript" | "zod" | "openapi"

const OUTPUT_LABELS: Record<ContractOutput, string> = {
  "json-schema": "JSON Schema",
  typescript: "TypeScript",
  zod: "Zod",
  openapi: "OpenAPI",
}

export function SchemaWorkspace() {
  const lens = useJsonLens()
  const [outputType, setOutputType] = useState<ContractOutput>("json-schema")
  const [comparisonSchemaText, setComparisonSchemaText] = useState("")
  const [schemaDiffMessage, setSchemaDiffMessage] = useState("")
  const [schemaDiffRows, setSchemaDiffRows] = useState<Array<{ path: string; left: string; right: string }>>([])
  const bundle = useMemo<ContractBundle | null>(() => {
    if (lens.parseResult.error) return null
    return buildContractBundle(lens.parseResult.value, "Root")
  }, [lens.parseResult.error, lens.parseResult.value])
  const output = bundle ? getContractOutput(bundle, outputType) : ""

  async function copyOutput() {
    await copyText(output)
    lens.notify(`${OUTPUT_LABELS[outputType]} copied.`)
  }

  function downloadOutput() {
    const extension = outputType === "typescript" || outputType === "zod" ? "ts" : "json"
    downloadText(
      `json-lens-${outputType}.${extension}`,
      output,
      extension === "ts" ? "text/typescript" : "application/json"
    )
    lens.notify(`${OUTPUT_LABELS[outputType]} downloaded.`)
  }

  function compareSchemas() {
    if (!bundle) return

    const parsed = parseJson(comparisonSchemaText)
    if (parsed.error) {
      setSchemaDiffRows([])
      setSchemaDiffMessage(parsed.error)
      return
    }

    const rows = compareSchemaDocuments(bundle.jsonSchema, inferJsonSchema(parsed.value))
    setSchemaDiffRows(rows)
    setSchemaDiffMessage(rows.length ? "" : "No schema differences found.")
    lens.notify("Schema comparison complete.")
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode2Icon className="size-4" />
              Contracts
            </CardTitle>
            <CardDescription>
              Generate contracts from the active JSON shape and review optional, nullable, and enum-like paths.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="grid gap-2 text-sm font-medium">
              Contract output
              <Select value={outputType} onValueChange={(value) => setOutputType(value as ContractOutput)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(OUTPUT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <div className="grid gap-2">
              <MetricBadge label="Optional" value={bundle?.optionalFields.length ?? 0} />
              <MetricBadge label="Nullable" value={bundle?.nullableFields.length ?? 0} />
              <MetricBadge label="Enum candidates" value={bundle?.enumCandidates.length ?? 0} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button title="Copy generated contract" disabled={!bundle} onClick={copyOutput}>
                <ClipboardIcon data-icon="inline-start" />
                Copy
              </Button>
              <Button variant="outline" title="Download generated contract" disabled={!bundle} onClick={downloadOutput}>
                <DownloadIcon data-icon="inline-start" />
                Download
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{OUTPUT_LABELS[outputType]}</CardTitle>
            <CardDescription>Generated from the active source document.</CardDescription>
          </CardHeader>
          <CardContent>
            <JsonCodeEditor
              aria-label={`${OUTPUT_LABELS[outputType]} output`}
              value={output}
              onChange={() => undefined}
              onContextCopy={lens.notify}
            />
          </CardContent>
        </Card>
      </div>

      {bundle ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <SignalPanel title="Optional fields" rows={bundle.optionalFields.map((item) => [item.path, item.detail])} />
          <SignalPanel title="Nullable fields" rows={bundle.nullableFields.map((item) => [item.path, item.detail])} />
          <SignalPanel
            title="Enum candidates"
            rows={bundle.enumCandidates.map((item) => [item.path, item.values.map(String).join(", ")])}
          />
        </div>
      ) : null}

      <Card>
        <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrowsIcon className="size-4" />
              Compare schema
            </CardTitle>
            <CardDescription>
              Paste another example payload or schema-like JSON to compare its inferred shape.
            </CardDescription>
          </div>
          <Button title="Compare schemas" disabled={!bundle || !comparisonSchemaText.trim()} onClick={compareSchemas}>
            <GitCompareArrowsIcon data-icon="inline-start" />
            Compare
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <JsonCodeEditor
            aria-label="Schema comparison JSON"
            placeholder="Paste another payload or schema JSON."
            value={comparisonSchemaText}
            onChange={setComparisonSchemaText}
            onContextCopy={lens.notify}
          />
          {schemaDiffMessage ? (
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {schemaDiffMessage}
            </p>
          ) : null}
          {schemaDiffRows.length ? (
            <div className="max-h-80 overflow-auto rounded-md border">
              {schemaDiffRows.map((row) => (
                <div key={row.path} className="grid gap-2 border-b p-3 text-xs md:grid-cols-[1fr_1fr_1fr]">
                  <span className="font-mono">{row.path}</span>
                  <span>Current: {row.left}</span>
                  <span>Comparison: {row.right}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

function getContractOutput(bundle: ContractBundle, outputType: ContractOutput) {
  if (outputType === "json-schema") return bundle.jsonSchemaText
  if (outputType === "typescript") return bundle.typeScript
  if (outputType === "zod") return bundle.zodSchema
  return bundle.openApiSchema
}

function MetricBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Badge variant="secondary">{value.toLocaleString()}</Badge>
    </div>
  )
}

function SignalPanel({ title, rows }: { title: string; rows: string[][] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListChecksIcon className="size-4" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length ? (
          <div className="max-h-64 overflow-auto rounded-md border">
            {rows.slice(0, 80).map(([path, detail]) => (
              <div key={`${path}:${detail}`} className="grid gap-1 border-b p-2 text-xs">
                <span className="font-mono">{path}</span>
                <span className="text-muted-foreground">{detail}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            No signals found.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
