"use client"

import { useState, type ComponentType, type FormEvent, type SVGProps } from "react"
import {
  ClipboardIcon,
  DatabaseIcon,
  FileJsonIcon,
  HistoryIcon,
  LinkIcon,
  ListTreeIcon,
  RotateCcwIcon,
  SaveIcon,
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

import { useJsonLens } from "./json-lens-provider"

const SOURCE_ACTION_CLASS = "h-8 rounded-full px-2.5 text-xs active:!translate-y-0"

export function SourceManagementPanel() {
  const lens = useJsonLens()
  const [url, setUrl] = useState("")
  const metadata = lens.sourceMetadata
  const original = lens.originalSourceMetadata

  async function submitUrlImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await lens.importJsonFromUrl(url)
  }

  return (
    <Card size="sm">
      <CardHeader className="gap-3 lg:grid-cols-[1fr_auto]">
        <CardTitle className="flex items-center gap-2">
          <DatabaseIcon className="size-4" />
          Source management
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={SOURCE_ACTION_CLASS}
            title="Import JSON from clipboard"
            onClick={lens.importFromClipboard}
          >
            <ClipboardIcon data-icon="inline-start" />
            Clipboard
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={SOURCE_ACTION_CLASS}
            title="Convert editor NDJSON into a JSON array"
            onClick={lens.importNdjson}
          >
            <ListTreeIcon data-icon="inline-start" />
            NDJSON
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={SOURCE_ACTION_CLASS}
            title={`Reset active JSON to ${original.label}`}
            disabled={lens.jsonInput === lens.originalJsonInput}
            onClick={lens.resetToOriginalSource}
          >
            <RotateCcwIcon data-icon="inline-start" />
            Reset
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className={SOURCE_ACTION_CLASS}
            title="Save current workspace snapshot"
            disabled={!lens.jsonInput.trim()}
            onClick={lens.saveWorkspaceSnapshot}
          >
            <SaveIcon data-icon="inline-start" />
            Snapshot
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={SOURCE_ACTION_CLASS}
                title="Restore a saved workspace snapshot"
                disabled={!lens.snapshots.length}
              >
                <HistoryIcon data-icon="inline-start" />
                Restore
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Workspace snapshots</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {lens.snapshots.map((snapshot) => (
                <DropdownMenuItem
                  key={snapshot.id}
                  className="flex flex-col items-start gap-1"
                  onSelect={() => lens.restoreWorkspaceSnapshot(snapshot.id)}
                >
                  <span className="font-medium">{snapshot.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(snapshot.createdAt).toLocaleString()}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={submitUrlImport}>
          <div className="relative min-w-0 flex-1">
            <LinkIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              type="url"
              value={url}
              placeholder="https://example.com/data.json"
              onChange={(event) => setUrl(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            variant="default"
            size="sm"
            className="h-8 active:!translate-y-0"
            disabled={lens.isProcessing}
            title="Import JSON from URL"
          >
            <LinkIcon data-icon="inline-start" />
            Import URL
          </Button>
        </form>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <SourceMetric
            icon={FileJsonIcon}
            label="Source"
            value={metadata.label}
            detail={metadata.detail ?? metadata.kind}
          />
          <SourceMetric label="Size" value={lens.inputSizeLabel} detail={metadata.fileName} />
          <SourceMetric
            label="Rows"
            value={lens.parseResult.error ? "Needs JSON" : lens.totalRows.toLocaleString()}
            detail={lens.sourceSummary}
          />
          <SourceMetric
            label="Imported"
            value={formatSourceTimestamp(metadata.importedAt)}
            detail={metadata.url}
          />
        </div>

        {lens.parseResult.error ? (
          <Badge variant="destructive" className="rounded-full px-2 text-xs">
            Source has parse errors
          </Badge>
        ) : (
          <Badge variant="secondary" className="rounded-full px-2 text-xs">
            Source parsed
          </Badge>
        )}
      </CardContent>
    </Card>
  )
}

function SourceMetric({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail?: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/30 px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {Icon ? <Icon className="size-3.5" /> : null}
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
      {detail ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  )
}

function formatSourceTimestamp(timestamp: string) {
  if (timestamp === "Session start") return timestamp

  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return timestamp
  }
}
