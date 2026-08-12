"use client"

import { CheckCircle2Icon, ClipboardIcon, FlaskConicalIcon, PlayCircleIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { copyText } from "@/lib/json-lens"

import { useJsonLens } from "./json-lens-provider"

const CHECKS = [
  ["Engine unit tests", "npm test", "parse, extraction, transform, diff, schema, export"],
  ["Exact extraction fixtures", "npm test", "case-sensitive field matching and array path normalization"],
  ["Transformation round-trip tests", "npm test", "flatten and unflatten behavior"],
  ["Export escaping tests", "npm test", "CSV, TSV, NDJSON, and Markdown escaping"],
  ["Browser workflow checks", "curl -I http://127.0.0.1:3000/{route}", "route-level smoke checks"],
  ["Build and lint gates", "npm run verify", "lint, engine tests, and production build"],
]

export function VerificationWorkspace() {
  const lens = useJsonLens()

  async function copyCommand(command: string) {
    await copyText(command)
    lens.notify("Verification command copied.")
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FlaskConicalIcon className="size-4" />
            Verification gates
          </CardTitle>
          <CardDescription>
            Focused checks for library behavior, export escaping, UI route availability, and build health.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {CHECKS.map(([title, command, detail]) => (
            <div key={title} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 font-medium">
                    <CheckCircle2Icon className="size-4 text-primary" />
                    {title}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                </div>
                <Badge variant="secondary">Implemented</Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                title={`Copy ${command}`}
                onClick={() => copyCommand(command)}
              >
                <ClipboardIcon data-icon="inline-start" />
                {command}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PlayCircleIcon className="size-4" />
            Recommended local sequence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-auto rounded-md border bg-muted p-3 text-xs">
{`npm run lint
npm test
npm run build
curl -I http://127.0.0.1:3000/schema
curl -I http://127.0.0.1:3000/export
curl -I http://127.0.0.1:3000/developer
curl -I http://127.0.0.1:3000/performance
curl -I http://127.0.0.1:3000/verification`}
          </pre>
        </CardContent>
      </Card>
    </section>
  )
}
