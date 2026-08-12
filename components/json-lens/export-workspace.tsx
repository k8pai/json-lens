"use client"

import { useMemo, useRef, useState } from "react"
import {
  ClipboardIcon,
  DownloadIcon,
  FileCode2Icon,
  FileJsonIcon,
  FileSpreadsheetIcon,
  Rows3Icon,
  XIcon,
} from "lucide-react"
import type { ComponentType, SVGProps } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  copyText,
  downloadText,
  stringifyPretty,
} from "@/lib/json-lens"
import {
  exportSelectedSubtree,
  getExportFilename,
  getExportMimeType,
  rowsToMarkdownTable,
  rowsToNdjson,
  rowsToTsv,
  serializeExport,
  type ExportFormat,
} from "@/lib/json-exports"
import { buildContractBundle } from "@/lib/json-schema-contracts"
import type { ExportWorkerResponse } from "@/lib/json-export.worker"

import { useJsonLens } from "./json-lens-provider"

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export function ExportWorkspace() {
  const lens = useJsonLens()
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const [format, setFormat] = useState<ExportFormat>("csv")
  const [subtreePath, setSubtreePath] = useState("$")
  const [isExporting, setIsExporting] = useState(false)
  const [exportOutput, setExportOutput] = useState("")
  const bundle = useMemo(
    () => (lens.parseResult.error ? undefined : buildContractBundle(lens.parseResult.value)),
    [lens.parseResult.error, lens.parseResult.value]
  )

  function serializeSelectedFormat() {
    return serializeExport({
      bundle,
      columns: lens.visibleColumns,
      format,
      indentationWidth: lens.indentationWidth,
      input: lens.jsonInput,
      rows: lens.filteredRows,
    })
  }

  function runWorkerExport() {
    if (typeof Worker === "undefined") {
      setExportOutput(serializeSelectedFormat())
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setIsExporting(true)
    workerRef.current?.terminate()
    const worker = new Worker(new URL("../../lib/json-export.worker.ts", import.meta.url), {
      type: "module",
    })
    workerRef.current = worker

    worker.onmessage = (event: MessageEvent<ExportWorkerResponse>) => {
      const response = event.data
      if (response.id !== requestId) return

      if (response.ok) {
        setExportOutput(response.output)
        lens.notify("Export generated in worker.")
      } else {
        lens.notify(response.error)
      }

      setIsExporting(false)
      worker.terminate()
      workerRef.current = null
    }

    worker.onerror = (event) => {
      lens.notify(event.message || "Worker export failed.")
      setIsExporting(false)
      worker.terminate()
      workerRef.current = null
    }

    worker.postMessage({
      id: requestId,
      columns: lens.visibleColumns,
      format,
      indentationWidth: lens.indentationWidth,
      input: lens.jsonInput,
      rows: lens.filteredRows,
    })
  }

  function cancelWorkerExport() {
    workerRef.current?.terminate()
    workerRef.current = null
    setIsExporting(false)
    lens.notify("Export canceled.")
  }

  function exportSubtree() {
    const result = exportSelectedSubtree(lens.jsonInput, subtreePath, lens.indentationWidth)
    if (!result.ok) {
      lens.notify(result.error)
      return
    }

    downloadText("json-lens-subtree.json", result.output, "application/json")
    lens.notify("Selected subtree exported.")
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheetIcon className="size-4" />
              Export builder
            </CardTitle>
            <CardDescription>
              Generate table, document, and contract exports. Large serializations can run in a worker and be canceled.
            </CardDescription>
          </div>
          <Badge variant={isExporting ? "default" : "secondary"}>
            {isExporting ? "Exporting" : `${lens.filteredRows.length.toLocaleString()} rows`}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-[220px_1fr_auto_auto] lg:items-end">
          <label className="grid gap-2 text-sm font-medium">
            Format
            <Select value={format} onValueChange={(value) => setFormat(value as ExportFormat)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  ["csv", "CSV"],
                  ["tsv", "TSV"],
                  ["ndjson", "NDJSON"],
                  ["markdown", "Markdown table"],
                  ["json", "Source JSON"],
                  ["typescript", "TypeScript"],
                  ["json-schema", "JSON Schema"],
                  ["zod", "Zod"],
                  ["openapi", "OpenAPI"],
                ].map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Subtree path
            <Input value={subtreePath} onChange={(event) => setSubtreePath(event.target.value)} />
          </label>
          <Button title="Generate export in a worker" disabled={isExporting} onClick={runWorkerExport}>
            <DownloadIcon data-icon="inline-start" />
            Generate
          </Button>
          <Button variant="outline" title="Cancel worker export" disabled={!isExporting} onClick={cancelWorkerExport}>
            <XIcon data-icon="inline-start" />
            Cancel
          </Button>
          <div className="flex flex-wrap gap-2 lg:col-span-4">
            <Button
              variant="outline"
              title="Copy generated export"
              disabled={!exportOutput}
              onClick={async () => {
                await copyText(exportOutput)
                lens.notify("Generated export copied.")
              }}
            >
              <ClipboardIcon data-icon="inline-start" />
              Copy Generated
            </Button>
            <Button
              variant="outline"
              title="Download generated export"
              disabled={!exportOutput}
              onClick={() =>
                downloadText(getExportFilename(format), exportOutput, getExportMimeType(format))
              }
            >
              <DownloadIcon data-icon="inline-start" />
              Download Generated
            </Button>
            <Button variant="outline" title="Export selected subtree as JSON" onClick={exportSubtree}>
              <FileJsonIcon data-icon="inline-start" />
              Export Subtree
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <ExportAction
        icon={Rows3Icon}
        title="Visible table"
        description={`${lens.filteredRows.length.toLocaleString()} filtered rows as CSV${
          lens.isPreview ? " from the current preview" : ""
        }.`}
        primary="Download CSV"
        onPrimary={() =>
          downloadText(
            "json-lens-visible-table.csv",
            serializeExport({
              bundle,
              columns: lens.visibleColumns,
              format: "csv",
              indentationWidth: lens.indentationWidth,
              input: lens.jsonInput,
              rows: lens.filteredRows,
            }),
            "text/csv"
          )
        }
        secondary="Copy CSV"
        onSecondary={async () => {
          await copyText(serializeExport({
            bundle,
            columns: lens.visibleColumns,
            format: "csv",
            indentationWidth: lens.indentationWidth,
            input: lens.jsonInput,
            rows: lens.filteredRows,
          }))
          lens.notify("Visible CSV copied.")
        }}
      />
      <ExportAction
        icon={FileJsonIcon}
        title="Flattened JSON"
        description={
          lens.isPreview
            ? "The current filtered preview shape as JSON."
            : "The current filtered table shape as JSON."
        }
        primary="Download JSON"
        onPrimary={() =>
          downloadText(
            "json-lens-flattened.json",
            stringifyPretty(lens.filteredRows.map((row) => row.flat)),
            "application/json"
          )
        }
        secondary="Copy JSON"
        onSecondary={async () => {
          await copyText(stringifyPretty(lens.filteredRows.map((row) => row.flat)))
          lens.notify("Flattened JSON copied.")
        }}
      />
      <ExportAction
        icon={FileJsonIcon}
        title="Source JSON"
        description="The source JSON exactly as shown in the editor."
        primary="Download JSON"
        onPrimary={() =>
          downloadText("json-lens-source.json", lens.jsonInput, "application/json")
        }
        secondary="Copy source"
        onSecondary={async () => {
          await copyText(lens.jsonInput)
          lens.notify("Source JSON copied.")
        }}
      />
      <ExportAction
        icon={FileSpreadsheetIcon}
        title="Spreadsheet formats"
        description="TSV, NDJSON, and Markdown table exports for external tools."
        primary="Download TSV"
        onPrimary={() => downloadText("json-lens-visible-table.tsv", rowsToTsv(lens.filteredRows, lens.visibleColumns), "text/tab-separated-values")}
        secondary="Copy Markdown"
        onSecondary={async () => {
          await copyText(rowsToMarkdownTable(lens.filteredRows, lens.visibleColumns))
          lens.notify("Markdown table copied.")
        }}
      />
      <ExportAction
        icon={FileCode2Icon}
        title="Contracts"
        description="Generated TypeScript, JSON Schema, Zod, and OpenAPI artifacts."
        primary="Download Schema"
        onPrimary={() => downloadText("json-lens.schema.json", bundle?.jsonSchemaText ?? "{}", "application/json")}
        secondary="Copy NDJSON"
        onSecondary={async () => {
          await copyText(rowsToNdjson(lens.filteredRows))
          lens.notify("NDJSON copied.")
        }}
      />
      </div>
    </section>
  )
}

function ExportAction({
  description,
  icon: Icon,
  onPrimary,
  onSecondary,
  primary,
  secondary,
  title,
}: {
  description: string
  icon: Icon
  onPrimary: () => void
  onSecondary: () => void
  primary: string
  secondary: string
  title: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        <Button title={primary} onClick={onPrimary}>
          <DownloadIcon data-icon="inline-start" />
          {primary}
        </Button>
        <Button variant="outline" title={secondary} onClick={onSecondary}>
          <ClipboardIcon data-icon="inline-start" />
          {secondary}
        </Button>
      </CardContent>
    </Card>
  )
}
