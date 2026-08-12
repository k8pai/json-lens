"use client"

import { useMemo, useState } from "react"
import {
  ActivityIcon,
  DownloadIcon,
  FileJsonIcon,
  GaugeIcon,
  PlayIcon,
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
import { Input } from "@/components/ui/input"
import { downloadText } from "@/lib/json-lens"
import {
  estimateOperationCost,
  generateStressFixtureJson,
} from "@/lib/json-performance"

import { useJsonLens } from "./json-lens-provider"

export function PerformanceWorkspace() {
  const lens = useJsonLens()
  const [fixtureRows, setFixtureRows] = useState(5000)
  const [nestedItems, setNestedItems] = useState(3)
  const cost = useMemo(
    () =>
      estimateOperationCost({
        bytes: lens.inputBytes,
        columns: lens.columns.length,
        rows: lens.rows.length,
      }),
    [lens.columns.length, lens.inputBytes, lens.rows.length]
  )

  function downloadFixture() {
    downloadText(
      "json-lens-stress-fixture.json",
      generateStressFixtureJson({ rows: fixtureRows, nestedItems }),
      "application/json"
    )
    lens.notify("Stress fixture downloaded.")
  }

  function loadFixture() {
    lens.setJsonInput(generateStressFixtureJson({ rows: fixtureRows, nestedItems }))
    lens.notify("Stress fixture loaded.")
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Input size" value={lens.inputSizeLabel} />
        <MetricCard label="Rows" value={lens.rows.length.toLocaleString()} />
        <MetricCard label="Columns" value={lens.columns.length.toLocaleString()} />
        <MetricCard label="Cells" value={cost.cells.toLocaleString()} />
      </div>

      <Card>
        <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
          <div>
            <CardTitle className="flex items-center gap-2">
              <GaugeIcon className="size-4" />
              Large-data strategy
            </CardTitle>
            <CardDescription>
              JSON Lens uses workers and preview limits for expensive parsing, flattening, extraction, and export paths.
            </CardDescription>
          </div>
          <Badge variant={cost.large ? "destructive" : "secondary"}>
            {cost.large ? "Large" : "Interactive"}
          </Badge>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <StatusCard title="Worker-backed parsing" status="Implemented" />
          <StatusCard title="Worker-backed flattening" status="Implemented" />
          <StatusCard title="Worker-backed extraction" status="Implemented" />
          <StatusCard title="Worker-backed export" status="Implemented" />
          <StatusCard title="Virtualized tree/navigation lists" status="Implemented" />
          <StatusCard title="Virtualized table rows" status="Implemented" />
          <StatusCard title="Cancelable worker export" status="Implemented" />
          <StatusCard title="Large-data stress fixtures" status="Implemented" />
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground md:col-span-2">
            {cost.recommendation}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJsonIcon className="size-4" />
            Stress fixture
          </CardTitle>
          <CardDescription>
            Generate repeatable payloads for local performance and regression checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto] md:items-end">
          <label className="grid gap-2 text-sm font-medium">
            Rows
            <Input
              type="number"
              min={1}
              max={100000}
              value={fixtureRows}
              onChange={(event) => setFixtureRows(Number(event.target.value))}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Nested events per row
            <Input
              type="number"
              min={0}
              max={20}
              value={nestedItems}
              onChange={(event) => setNestedItems(Number(event.target.value))}
            />
          </label>
          <Button title="Load stress fixture into the active source" onClick={loadFixture}>
            <PlayIcon data-icon="inline-start" />
            Load
          </Button>
          <Button variant="outline" title="Download stress fixture" onClick={downloadFixture}>
            <DownloadIcon data-icon="inline-start" />
            Download
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="mt-2 text-xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  )
}

function StatusCard({ title, status }: { title: string; status: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <span className="flex items-center gap-2">
        <ActivityIcon className="size-3.5 text-primary" />
        {title}
      </span>
      <Badge variant="secondary">{status}</Badge>
    </div>
  )
}
