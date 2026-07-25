"use client"

import { ClipboardIcon, DownloadIcon, FileCode2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { copyText, downloadText } from "@/lib/json-lens"

import { useJsonLens } from "./json-lens-provider"

export function TypeScriptWorkspace() {
  const lens = useJsonLens()

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <pre className="min-h-[65vh] overflow-auto rounded-xl border bg-zinc-950 p-4 text-sm leading-6 text-zinc-50">
        {lens.typeScript || "Valid JSON will generate TypeScript here."}
      </pre>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode2Icon className="size-4" />
            TypeScript
          </CardTitle>
          <CardDescription>
            {lens.deferredStats
              ? "Generation is deferred in large-data preview mode."
              : "Generate interfaces and type aliases from the current JSON shape."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <Button
            title="Copy generated TypeScript"
            disabled={!lens.typeScript}
            onClick={async () => {
              await copyText(lens.typeScript)
              lens.notify("TypeScript copied.")
            }}
          >
            <ClipboardIcon data-icon="inline-start" />
            Copy types
          </Button>
          <Button
            variant="outline"
            title="Download generated TypeScript"
            disabled={!lens.typeScript}
            onClick={() => downloadText("json-lens-types.ts", lens.typeScript, "text/typescript")}
          >
            <DownloadIcon data-icon="inline-start" />
            Download .ts
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}
