"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  BarChart3Icon,
  BracesIcon,
  DownloadIcon,
  FileCode2Icon,
  FileJsonIcon,
  Rows3Icon,
  SparklesIcon,
  UploadIcon,
  Wand2Icon,
  WrapTextIcon,
} from "lucide-react"
import type { ComponentType, ReactNode, SVGProps } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { TooltipProvider } from "@/components/ui/tooltip"

import { useJsonLens } from "./json-lens-provider"
import { ActionButton, Metric } from "./shared"

type NavItem = {
  href: string
  label: string
  description: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/table",
    label: "Table",
    description: "Search, filter, sort, and inspect rows.",
    icon: Rows3Icon,
  },
  {
    href: "/json",
    label: "JSON",
    description: "Paste, upload, beautify, and validate JSON.",
    icon: FileJsonIcon,
  },
  {
    href: "/insights",
    label: "Insights",
    description: "Review frequencies, missing values, and warnings.",
    icon: BarChart3Icon,
  },
  {
    href: "/typescript",
    label: "TypeScript",
    description: "Generate interfaces from the current data.",
    icon: FileCode2Icon,
  },
  {
    href: "/export",
    label: "Export",
    description: "Download CSV, JSON, and TypeScript outputs.",
    icon: DownloadIcon,
  },
]

export function JsonLensShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const {
    beautifyJson,
    columns,
    fileInputRef,
    handleFile,
    jsonStats,
    largeInputWarning,
    loadSample,
    minifyJson,
    parseResult,
    rows,
    sourceSummary,
    toast,
    isProcessing,
    inputSizeLabel,
    isPreview,
    processingProgressLabel,
    totalRows,
  } = useJsonLens()

  return (
    <TooltipProvider>
      {/* App shell pattern: route-level purpose pages share one provider-backed workspace. */}
      <main
        className="min-h-screen bg-muted/40 text-foreground"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const file = event.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        <div className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col px-4 py-4 sm:px-6 lg:px-8">
          <header className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <SparklesIcon className="size-4 text-primary" />
                JSON Lens
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Turn JSON into a table anyone can use.
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              <ActionButton
                icon={UploadIcon}
                title="Upload a local .json file"
                variant="default"
                onClick={() => fileInputRef.current?.click()}
              >
                Upload
              </ActionButton>
              <ActionButton icon={BracesIcon} title="Load a sample dataset" onClick={loadSample}>
                Sample
              </ActionButton>
              <ActionButton icon={Wand2Icon} title="Format the JSON with indentation" onClick={beautifyJson}>
                Beautify
              </ActionButton>
              <ActionButton icon={WrapTextIcon} title="Remove JSON whitespace" onClick={minifyJson}>
                Minify
              </ActionButton>
            </div>

            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept=".json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleFile(file)
                event.currentTarget.value = ""
              }}
            />
          </header>

          <section className="grid gap-3 border-b py-4 sm:grid-cols-2 lg:grid-cols-5">
            <Metric
              label="Source"
              value={parseResult.error ? "Needs JSON" : sourceSummary}
            />
            <Metric
              label="Rows"
              value={
                isPreview
                  ? `${rows.length.toLocaleString()} / ${totalRows.toLocaleString()}`
                  : rows.length.toLocaleString()
              }
            />
            <Metric label="Columns" value={columns.length.toLocaleString()} />
            <Metric label="Keys" value={jsonStats?.keys.toLocaleString() ?? "0"} />
            <Metric label="Depth" value={jsonStats?.maxDepth.toLocaleString() ?? "0"} />
          </section>

          {parseResult.error ? (
            <Card className="mt-4 border-destructive/30 bg-destructive/5">
              <CardContent>
                <h2 className="font-semibold text-destructive">JSON needs a quick fix</h2>
                <p className="mt-1 text-sm text-destructive/90">{parseResult.error}</p>
                {parseResult.line && parseResult.column ? (
                  <p className="mt-2 font-mono text-xs text-destructive/80">
                    Line {parseResult.line}, column {parseResult.column}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <div className="min-h-0 flex-1 py-5">
            <WorkspaceNav pathname={pathname} />

            {isProcessing || largeInputWarning ? (
              <Card className="mb-5 border-primary/20 bg-primary/5">
                <CardContent>
                  <h2 className="font-semibold">
                    {isProcessing ? "Processing JSON in the background" : "Large JSON loaded"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isProcessing
                      ? `${processingProgressLabel}. Input size is ${inputSizeLabel}. The current table stays usable while parsing finishes.`
                      : largeInputWarning}
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <div className="min-w-0">{children}</div>
          </div>
        </div>

        {toast ? (
          <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg">
            {toast}
          </div>
        ) : null}
      </main>
    </TooltipProvider>
  )
}

function WorkspaceNav({ pathname }: { pathname: string }) {
  return (
    <Card className="mb-5 border-b py-4">
      <CardContent className="grid gap-2 md:grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href

          return (
            <Button
              key={item.href}
              asChild
              variant={active ? "secondary" : "ghost"}
              className="h-auto justify-start px-3 py-3 text-left text-wrap"
              title={item.description}
            >
              <Link href={item.href}>
                <Icon className="size-4" data-icon="inline-start" />
                <span className="grid place-self-stretch">
                  <span className="font-medium ">{item.label}</span>
                  <span className="text-xs text-muted-foreground text-wrap inline-block align-top">{item.description}</span>
                </span>
              </Link>
            </Button>
          )
        })}
      </CardContent>
    </Card>
  )
}
