"use client"

import { ClipboardIcon, DownloadIcon, FileJsonIcon, Rows3Icon } from "lucide-react"
import type { ComponentType, SVGProps } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  copyText,
  downloadText,
  rowsToCsv,
  stringifyPretty,
} from "@/lib/json-lens"

import { useJsonLens } from "./json-lens-provider"

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export function ExportWorkspace() {
  const lens = useJsonLens()

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
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
            rowsToCsv(lens.filteredRows, lens.visibleColumns),
            "text/csv"
          )
        }
        secondary="Copy CSV"
        onSecondary={async () => {
          await copyText(rowsToCsv(lens.filteredRows, lens.visibleColumns))
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
        icon={DownloadIcon}
        title="TypeScript"
        description={
          lens.deferredStats
            ? "Type generation is deferred in large-data preview mode."
            : "Generated interfaces and type aliases."
        }
        primary="Download .ts"
        onPrimary={() => downloadText("json-lens-types.ts", lens.typeScript, "text/typescript")}
        secondary="Copy types"
        onSecondary={async () => {
          await copyText(lens.typeScript)
          lens.notify("TypeScript copied.")
        }}
      />
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
