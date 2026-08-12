"use client"

import { useMemo, useState } from "react"
import {
  ClipboardIcon,
  Code2Icon,
  DownloadIcon,
  FileJsonIcon,
  GitCompareArrowsIcon,
  ListTreeIcon,
  PlayIcon,
  WebhookIcon,
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
import {
  copyText,
  downloadText,
  parseJson,
  stringifyPretty,
} from "@/lib/json-lens"
import {
  buildContractBundle,
  createMockPayload,
  generateFetchSnippet,
  generateFixtureFile,
  generatePathAssertions,
  generatePathList,
  inspectWebhookPayload,
} from "@/lib/json-schema-contracts"
import { compareJsonValues } from "@/lib/json-diff"

import { JsonCodeEditor } from "./json-code-editor"
import { useJsonLens } from "./json-lens-provider"

export function DeveloperWorkspace() {
  const lens = useJsonLens()
  const [apiUrl, setApiUrl] = useState("https://api.example.com/resource")
  const [apiResponse, setApiResponse] = useState("")
  const [formattedResponse, setFormattedResponse] = useState("")
  const [compareRows, setCompareRows] = useState<ReturnType<typeof compareJsonValues>>([])
  const [activeOutput, setActiveOutput] = useState("")
  const [activeOutputLabel, setActiveOutputLabel] = useState("Generated output")
  const parsedSource = lens.parseResult.error ? null : lens.parseResult.value
  const pathList = useMemo(
    () => (parsedSource === null ? [] : generatePathList(parsedSource)),
    [parsedSource]
  )
  const webhookSummary = useMemo(
    () => (parsedSource === null ? null : inspectWebhookPayload(parsedSource)),
    [parsedSource]
  )

  function formatApiResponse() {
    const parsed = parseJson(apiResponse)
    if (parsed.error) {
      lens.notify(parsed.error)
      return
    }

    setFormattedResponse(stringifyPretty(parsed.value, lens.indentationWidth))
    lens.notify("API response formatted.")
  }

  function compareRequestResponse() {
    const response = parseJson(apiResponse)
    if (response.error || parsedSource === null) {
      lens.notify(response.error ?? "Source JSON is invalid.")
      return
    }

    setCompareRows(compareJsonValues(parsedSource, response.value))
    lens.notify("Request and response compared.")
  }

  function generateMock() {
    if (parsedSource === null) return
    const mock = createMockPayload(buildContractBundle(parsedSource).jsonSchema)
    setActiveOutputLabel("Mock payload")
    setActiveOutput(stringifyPretty(mock, lens.indentationWidth))
  }

  function generateFetch() {
    if (parsedSource === null) return
    setActiveOutputLabel("Fetch snippet")
    setActiveOutput(generateFetchSnippet(parsedSource, apiUrl))
  }

  function generateFixture() {
    if (parsedSource === null) return
    setActiveOutputLabel("Fixture file")
    setActiveOutput(generateFixtureFile(parsedSource, "jsonLensPayload"))
  }

  function generateAssertions() {
    if (parsedSource === null) return
    setActiveOutputLabel("Path assertions")
    setActiveOutput(generatePathAssertions(parsedSource))
  }

  async function copyOutput() {
    await copyText(activeOutput)
    lens.notify(`${activeOutputLabel} copied.`)
  }

  function downloadOutput() {
    downloadText(
      `json-lens-${activeOutputLabel.toLowerCase().replace(/\s+/g, "-")}.txt`,
      activeOutput,
      "text/plain"
    )
    lens.notify(`${activeOutputLabel} downloaded.`)
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileJsonIcon className="size-4" />
              API response
            </CardTitle>
            <CardDescription>
              Format a response payload and compare it against the active source JSON.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <JsonCodeEditor
              aria-label="API response JSON"
              placeholder="Paste API response JSON here."
              value={apiResponse}
              onChange={setApiResponse}
              onContextCopy={lens.notify}
            />
            <div className="flex flex-wrap gap-2">
              <Button title="Format API response" disabled={!apiResponse.trim()} onClick={formatApiResponse}>
                <PlayIcon data-icon="inline-start" />
                Format
              </Button>
              <Button
                variant="outline"
                title="Compare source request with API response"
                disabled={!apiResponse.trim()}
                onClick={compareRequestResponse}
              >
                <GitCompareArrowsIcon data-icon="inline-start" />
                Compare
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Code2Icon className="size-4" />
              API utilities
            </CardTitle>
            <CardDescription>
              Generate integration snippets and test artifacts from the active JSON.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="grid gap-2 text-sm font-medium">
              Endpoint URL
              <Input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" title="Generate mock payload" onClick={generateMock}>
                Mock Payload
              </Button>
              <Button variant="outline" title="Generate TypeScript fetch snippet" onClick={generateFetch}>
                Fetch Snippet
              </Button>
              <Button variant="outline" title="Generate fixture file" onClick={generateFixture}>
                Fixture
              </Button>
              <Button variant="outline" title="Generate path assertions" onClick={generateAssertions}>
                Assertions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {formattedResponse ? (
        <OutputCard
          title="Formatted response"
          value={formattedResponse}
          onCopy={async () => {
            await copyText(formattedResponse)
            lens.notify("Formatted response copied.")
          }}
          onDownload={() => downloadText("json-lens-api-response.json", formattedResponse, "application/json")}
        />
      ) : null}

      {compareRows.length ? (
        <Card>
          <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
            <CardTitle>Request / response differences</CardTitle>
            <Badge variant="secondary">{compareRows.length.toLocaleString()}</Badge>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kind</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Request</TableHead>
                    <TableHead>Response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compareRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.kind}</TableCell>
                      <TableCell className="font-mono text-xs">{row.path}</TableCell>
                      <TableCell className="font-mono text-xs">{row.leftValue}</TableCell>
                      <TableCell className="font-mono text-xs">{row.rightValue}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activeOutput ? (
        <OutputCard title={activeOutputLabel} value={activeOutput} onCopy={copyOutput} onDownload={downloadOutput} />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WebhookIcon className="size-4" />
              Webhook inspection
            </CardTitle>
            <CardDescription>Common webhook identity fields inferred from the active JSON.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <SummaryRow label="Event" value={webhookSummary?.eventType ?? "unknown"} />
            <SummaryRow label="Object ID" value={webhookSummary?.objectId ?? "unknown"} />
            <SummaryRow label="Timestamp" value={webhookSummary?.timestamp ?? "unknown"} />
            <SummaryRow label="Paths" value={(webhookSummary?.pathCount ?? 0).toLocaleString()} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
            <CardTitle className="flex items-center gap-2">
              <ListTreeIcon className="size-4" />
              Path list
            </CardTitle>
            <Badge variant="secondary">{pathList.length.toLocaleString()} paths</Badge>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Path</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Occurrences</TableHead>
                    <TableHead>Example</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pathList.slice(0, 200).map((item) => (
                    <TableRow key={item.path}>
                      <TableCell className="font-mono text-xs">{item.path}</TableCell>
                      <TableCell>{item.type}</TableCell>
                      <TableCell>{item.occurrences.toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-xs">{item.example}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

function OutputCard({
  title,
  value,
  onCopy,
  onDownload,
}: {
  title: string
  value: string
  onCopy: () => void | Promise<void>
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

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  )
}
