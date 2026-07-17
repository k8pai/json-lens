"use client"

import { ClipboardIcon, EraserIcon, FileJsonIcon, Wand2Icon, WrapTextIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { copyText } from "@/lib/json-lens"

import { useJsonLens } from "./json-lens-provider"

export function JsonWorkspace() {
  const lens = useJsonLens()

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Textarea
        className="min-h-[65vh] resize-y font-mono text-sm leading-6"
        spellCheck={false}
        value={lens.jsonInput}
        onChange={(event) => lens.setJsonInput(event.target.value)}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJsonIcon className="size-4" />
            JSON tools
          </CardTitle>
          <CardDescription>
            Files stay in your browser. Drag a .json file anywhere on the page to load it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={lens.largeInputWarning ? "destructive" : "secondary"}>
              {lens.inputSizeLabel}
            </Badge>
            {lens.isProcessing ? <span>Processing in background</span> : null}
          </div>
          <Button
            title="Format the JSON with indentation"
            disabled={Boolean(lens.largeInputWarning)}
            onClick={lens.beautifyJson}
          >
            <Wand2Icon data-icon="inline-start" />
            Beautify JSON
          </Button>
          <Button
            variant="outline"
            title="Remove whitespace from the JSON"
            disabled={Boolean(lens.largeInputWarning)}
            onClick={lens.minifyJson}
          >
            <WrapTextIcon data-icon="inline-start" />
            Minify JSON
          </Button>
          <Button
            variant="outline"
            title="Copy the current JSON"
            onClick={async () => {
              await copyText(lens.jsonInput)
              lens.notify("JSON copied.")
            }}
          >
            <ClipboardIcon data-icon="inline-start" />
            Copy JSON
          </Button>
          <Button variant="destructive" title="Clear the JSON editor" onClick={() => lens.setJsonInput("")}>
            <EraserIcon data-icon="inline-start" />
            Clear
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
