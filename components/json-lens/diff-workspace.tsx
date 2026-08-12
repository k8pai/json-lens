"use client"

import { useMemo, useState } from "react"
import {
  ClipboardIcon,
  DownloadIcon,
  GitCompareArrowsIcon,
  GitMergeIcon,
  ListFilterIcon,
  PlayIcon,
  SquareStackIcon,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  copyText,
  downloadText,
  stringifyPretty,
} from "@/lib/json-lens"
import {
  applyJsonPatchText,
  compareJsonDocuments,
  countDiffKinds,
  generateJsonPatch,
  getDiffKindLabel,
  threeWayMergeJson,
  type JsonDiffKind,
  type JsonDiffRow,
  type MergeConflict,
} from "@/lib/json-diff"

import { JsonCodeEditor } from "./json-code-editor"
import { useJsonLens } from "./json-lens-provider"

const DIFF_KINDS: JsonDiffKind[] = [
  "right-only",
  "left-only",
  "changed",
  "type",
  "null",
  "array-count",
]

export function DiffWorkspace() {
  const lens = useJsonLens()
  const [comparisonJson, setComparisonJson] = useState("")
  const [identityKey, setIdentityKey] = useState("id")
  const [diffRows, setDiffRows] = useState<JsonDiffRow[]>([])
  const [activeKinds, setActiveKinds] = useState<Set<JsonDiffKind>>(() => new Set())
  const [message, setMessage] = useState("")
  const [patchText, setPatchText] = useState("")
  const [patchOutput, setPatchOutput] = useState("")
  const [localJson, setLocalJson] = useState("")
  const [remoteJson, setRemoteJson] = useState("")
  const [mergeOutput, setMergeOutput] = useState("")
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([])
  const counts = useMemo(() => countDiffKinds(diffRows), [diffRows])
  const filteredRows = useMemo(() => {
    if (!activeKinds.size) return diffRows
    return diffRows.filter((row) => activeKinds.has(row.kind))
  }, [activeKinds, diffRows])

  function runCompare(useIdentityKey: boolean) {
    const result = compareJsonDocuments(lens.jsonInput, comparisonJson, {
      identityKey: useIdentityKey ? identityKey.trim() : undefined,
    })

    if (!result.ok) {
      setDiffRows([])
      setMessage(result.error)
      lens.notify("Compare failed.")
      return
    }

    setDiffRows(result.rows)
    setMessage(result.rows.length ? "" : "No differences found.")
    lens.notify("Comparison complete.")
  }

  function createPatch() {
    const result = generateJsonPatch(lens.jsonInput, comparisonJson)

    if (!result.ok) {
      setMessage(result.error)
      lens.notify("Patch generation failed.")
      return
    }

    const output = stringifyPretty(result.patch)
    setPatchText(output)
    lens.notify(`${result.patch.length.toLocaleString()} patch operation${result.patch.length === 1 ? "" : "s"} generated.`)
  }

  function applyPatch() {
    const result = applyJsonPatchText(lens.jsonInput, patchText, lens.indentationWidth)

    if (!result.ok) {
      setPatchOutput(result.output)
      setMessage(result.error)
      lens.notify("Patch application failed.")
      return
    }

    setPatchOutput(result.output)
    setMessage(`Patch applied to ${result.affectedPaths.length.toLocaleString()} path${result.affectedPaths.length === 1 ? "" : "s"}.`)
    lens.notify("Patch applied.")
  }

  function runMerge() {
    const result = threeWayMergeJson(
      lens.jsonInput,
      localJson,
      remoteJson,
      lens.indentationWidth
    )

    if (!result.ok) {
      setMergeOutput("")
      setMergeConflicts([])
      setMessage(result.error)
      lens.notify("Merge failed.")
      return
    }

    setMergeOutput(result.output)
    setMergeConflicts(result.conflicts)
    lens.notify(result.conflicts.length ? "Merge completed with conflicts." : "Merge completed.")
  }

  async function copyTextValue(value: string, label: string) {
    await copyText(value)
    lens.notify(`${label} copied.`)
  }

  function applyOutput(value: string, label: string) {
    if (!value.trim()) return
    lens.setJsonInput(value)
    lens.notify(`${label} applied to source JSON.`)
  }

  function toggleKind(kind: JsonDiffKind) {
    setActiveKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitCompareArrowsIcon className="size-4" />
              Compare documents
            </CardTitle>
            <CardDescription>
              Base comes from the active source JSON. Paste the comparison document here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <JsonCodeEditor
              aria-label="Comparison JSON"
              placeholder="Paste comparison JSON here."
              value={comparisonJson}
              onChange={(value) => {
                setComparisonJson(value)
                setDiffRows([])
              }}
              onContextCopy={lens.notify}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                title="Compare by normal JSON structure"
                disabled={!comparisonJson.trim()}
                onClick={() => runCompare(false)}
              >
                <PlayIcon data-icon="inline-start" />
                Compare
              </Button>
              <label className="flex items-center gap-2 text-sm font-medium">
                Identity key
                <Input
                  className="h-8 w-32"
                  value={identityKey}
                  onChange={(event) => setIdentityKey(event.target.value)}
                />
              </label>
              <Button
                variant="outline"
                title="Compare object arrays by identity key"
                disabled={!comparisonJson.trim() || !identityKey.trim()}
                onClick={() => runCompare(true)}
              >
                <SquareStackIcon data-icon="inline-start" />
                Compare Arrays
              </Button>
              <Button
                variant="secondary"
                title="Generate JSON Patch from base to comparison"
                disabled={!comparisonJson.trim()}
                onClick={createPatch}
              >
                <ListFilterIcon data-icon="inline-start" />
                Generate Patch
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListFilterIcon className="size-4" />
              JSON Patch
            </CardTitle>
            <CardDescription>
              Generate patch operations from the comparison or paste a patch to apply to the base.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              className="min-h-52 font-mono text-xs"
              placeholder='[{"op":"replace","path":"/name","value":"New name"}]'
              value={patchText}
              onChange={(event) => setPatchText(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button title="Apply JSON Patch to source JSON" disabled={!patchText.trim()} onClick={applyPatch}>
                <PlayIcon data-icon="inline-start" />
                Apply Patch
              </Button>
              <Button
                variant="outline"
                title="Copy JSON Patch"
                disabled={!patchText.trim()}
                onClick={() => copyTextValue(patchText, "Patch")}
              >
                <ClipboardIcon data-icon="inline-start" />
                Copy Patch
              </Button>
              <Button
                variant="outline"
                title="Download JSON Patch"
                disabled={!patchText.trim()}
                onClick={() => downloadText("json-lens.patch.json", patchText, "application/json")}
              >
                <DownloadIcon data-icon="inline-start" />
                Download Patch
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {message ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">{message}</p>
          </CardContent>
        </Card>
      ) : null}

      {diffRows.length ? (
        <DiffTable
          activeKinds={activeKinds}
          counts={counts}
          filteredRows={filteredRows}
          rows={diffRows}
          onToggleKind={toggleKind}
        />
      ) : null}

      {patchOutput ? (
        <OutputPanel
          title="Patch result"
          value={patchOutput}
          onApply={() => applyOutput(patchOutput, "Patch result")}
          onCopy={() => copyTextValue(patchOutput, "Patch result")}
          onDownload={() => downloadText("json-lens-patch-result.json", patchOutput, "application/json")}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitMergeIcon className="size-4" />
            Three-way merge
          </CardTitle>
          <CardDescription>
            Base is the active source JSON. Paste local and remote versions to merge non-conflicting changes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 xl:grid-cols-2">
            <JsonCodeEditor
              aria-label="Local JSON"
              placeholder="Paste local JSON here."
              value={localJson}
              onChange={setLocalJson}
              onContextCopy={lens.notify}
            />
            <JsonCodeEditor
              aria-label="Remote JSON"
              placeholder="Paste remote JSON here."
              value={remoteJson}
              onChange={setRemoteJson}
              onContextCopy={lens.notify}
            />
          </div>
          <Button title="Run three-way merge" disabled={!localJson.trim() || !remoteJson.trim()} onClick={runMerge}>
            <GitMergeIcon data-icon="inline-start" />
            Merge
          </Button>
        </CardContent>
      </Card>

      {mergeConflicts.length ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle>Merge conflicts</CardTitle>
            <CardDescription>Resolve these paths manually before trusting the merged output.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 overflow-auto rounded-md border bg-background">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead>Local</TableHead>
                    <TableHead>Remote</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mergeConflicts.map((conflict) => (
                    <TableRow key={conflict.path}>
                      <TableCell className="font-mono text-xs">{conflict.path}</TableCell>
                      <TableCell className="font-mono text-xs">{conflict.localValue}</TableCell>
                      <TableCell className="font-mono text-xs">{conflict.remoteValue}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {mergeOutput ? (
        <OutputPanel
          title="Merge result"
          value={mergeOutput}
          onApply={() => applyOutput(mergeOutput, "Merge result")}
          onCopy={() => copyTextValue(mergeOutput, "Merge result")}
          onDownload={() => downloadText("json-lens-merge-result.json", mergeOutput, "application/json")}
        />
      ) : null}
    </section>
  )
}

function DiffTable({
  activeKinds,
  counts,
  filteredRows,
  rows,
  onToggleKind,
}: {
  activeKinds: Set<JsonDiffKind>
  counts: Record<JsonDiffKind, number>
  filteredRows: JsonDiffRow[]
  rows: JsonDiffRow[]
  onToggleKind: (kind: JsonDiffKind) => void
}) {
  return (
    <Card>
      <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
        <CardTitle>Diff result</CardTitle>
        <Badge variant="secondary">
          {filteredRows.length.toLocaleString()} of {rows.length.toLocaleString()}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {DIFF_KINDS.map((kind) => {
            const active = activeKinds.has(kind)

            return (
              <Button
                key={kind}
                variant={active ? "secondary" : "outline"}
                size="sm"
                aria-pressed={active}
                title={`Filter ${getDiffKindLabel(kind)} diffs`}
                onClick={() => onToggleKind(kind)}
              >
                {getDiffKindLabel(kind)}
                <Badge variant="secondary" className="ml-1">
                  {counts[kind].toLocaleString()}
                </Badge>
              </Button>
            )
          })}
        </div>
        <div className="max-h-96 overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              <TableRow>
                <TableHead>Kind</TableHead>
                <TableHead>Path</TableHead>
                <TableHead>Pointer</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>Comparison</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <Badge variant="outline">{getDiffKindLabel(row.kind)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.path}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{row.pointer || "/"}</TableCell>
                  <TableCell className="font-mono text-xs">{row.leftValue}</TableCell>
                  <TableCell className="font-mono text-xs">{row.rightValue}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function OutputPanel({
  title,
  value,
  onApply,
  onCopy,
  onDownload,
}: {
  title: string
  value: string
  onApply: () => void
  onCopy: () => void
  onDownload: () => void
}) {
  return (
    <Card>
      <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
        <CardTitle>{title}</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" title={`Copy ${title}`} onClick={onCopy}>
            <ClipboardIcon data-icon="inline-start" />
            Copy
          </Button>
          <Button variant="outline" title={`Download ${title}`} onClick={onDownload}>
            <DownloadIcon data-icon="inline-start" />
            Download
          </Button>
          <Button variant="secondary" title={`Apply ${title} to source JSON`} onClick={onApply}>
            Apply
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <JsonCodeEditor
          aria-label={title}
          value={value}
          onChange={() => undefined}
          onContextCopy={() => undefined}
        />
      </CardContent>
    </Card>
  )
}
