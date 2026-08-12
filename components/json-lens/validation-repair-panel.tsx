"use client"

import { useEffect, useRef, useState } from "react"
import {
  CheckCircle2Icon,
  ClipboardIcon,
  DownloadIcon,
  FileCheck2Icon,
  LoaderCircleIcon,
  ShieldAlertIcon,
  WrenchIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { copyText } from "@/lib/json-lens"
import type { JsonValidationIssue, JsonValidationReport } from "@/lib/json-validation"
import type { JsonValidationResponse } from "@/lib/json-validation.worker"

const ACTION_CLASS = "h-7 rounded-full px-2 text-xs active:!translate-y-0"

export function ValidationRepairPanel({
  sourceJson,
  notify,
  onApplyRepair,
}: {
  sourceJson: string
  notify: (message: string) => void
  onApplyRepair: (repairedJson: string) => void
}) {
  const [report, setReport] = useState<JsonValidationReport | null>(null)
  const [error, setError] = useState("")
  const [isValidating, setIsValidating] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const previousSourceRef = useRef(sourceJson)

  useEffect(() => {
    if (previousSourceRef.current === sourceJson) return

    previousSourceRef.current = sourceJson
    requestIdRef.current += 1
    workerRef.current?.terminate()
    workerRef.current = null
    setIsValidating(false)
    setReport(null)
    setError("")
  }, [sourceJson])

  useEffect(() => () => workerRef.current?.terminate(), [])

  function validateSource() {
    if (!sourceJson.trim()) {
      setError("Paste Source JSON before validating it.")
      return
    }

    workerRef.current?.terminate()
    const worker = new Worker(
      new URL("../../lib/json-validation.worker.ts", import.meta.url),
      { type: "module" }
    )
    const requestId = requestIdRef.current + 1

    requestIdRef.current = requestId
    workerRef.current = worker
    setIsValidating(true)
    setError("")
    setReport(null)

    worker.onmessage = (event: MessageEvent<JsonValidationResponse>) => {
      const response = event.data
      if (response.requestId !== requestIdRef.current) return

      setIsValidating(false)
      worker.terminate()
      workerRef.current = null

      if (!response.ok) {
        setError(response.error)
        notify("JSON validation could not be completed.")
        return
      }

      setReport(response.report)
      notify(response.report.strictValid ? "Source JSON is valid." : "Validation found JSON issues.")
    }

    worker.onerror = (event) => {
      if (requestId !== requestIdRef.current) return

      setIsValidating(false)
      setError(event.message || "Could not validate JSON.")
      worker.terminate()
      workerRef.current = null
    }

    worker.postMessage({ input: sourceJson, requestId })
  }

  function applyRepair() {
    if (!report?.repairedText || !report.repairCandidateValid) return
    onApplyRepair(report.repairedText)
    notify("Confirmed repair applied to Source JSON.")
  }

  async function copyReport() {
    if (!report) return
    await copyText(createReportJson(report, sourceJson))
    notify("Validation report copied.")
  }

  function downloadReport() {
    if (!report) return

    const blob = new Blob([createReportJson(report, sourceJson)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "json-validation-report.json"
    link.click()
    URL.revokeObjectURL(url)
    notify("Validation report downloaded.")
  }

  return (
    <Card size="sm">
      <CardHeader className="gap-2 sm:grid-cols-[1fr_auto]">
        <div className="space-y-0.5">
          <CardTitle className="flex items-center gap-2">
            <FileCheck2Icon className="size-4" />
            Validation and Repair
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Strict validation with explicit, reviewable repairs for common JSON-like syntax.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {report ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={ACTION_CLASS}
                title="Copy the reusable validation report"
                onClick={copyReport}
              >
                <ClipboardIcon data-icon="inline-start" />
                Copy Report
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                title="Download the validation report as JSON"
                aria-label="Download validation report"
                onClick={downloadReport}
              >
                <DownloadIcon />
              </Button>
            </>
          ) : null}
          <Button
            type="button"
            size="sm"
            className={ACTION_CLASS}
            title="Validate Source JSON with strict JSON rules"
            disabled={isValidating || !sourceJson.trim()}
            onClick={validateSource}
          >
            {isValidating ? (
              <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
            ) : (
              <FileCheck2Icon data-icon="inline-start" />
            )}
            {isValidating ? "Validating" : report ? "Validate Again" : "Validate"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {report ? (
          <>
            <ValidationSummary report={report} />
            {report.issues.length ? <IssueTable issues={report.issues} /> : null}
            {report.repairedText ? (
              <section className="space-y-2 border-t pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium">Repair preview</h3>
                    <p className="text-xs text-muted-foreground">
                      Review the proposed text before replacing Source JSON.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className={ACTION_CLASS}
                    title="Apply this reviewed repair to Source JSON"
                    disabled={!report.repairCandidateValid}
                    onClick={applyRepair}
                  >
                    <WrenchIcon data-icon="inline-start" />
                    Apply to Source
                  </Button>
                </div>
                <pre className="max-h-72 overflow-auto rounded-lg border bg-muted p-3 font-mono text-xs leading-5 whitespace-pre-wrap">
                  {report.repairedText}
                </pre>
                {!report.repairCandidateValid ? (
                  <p className="text-xs text-destructive">
                    The safe edits do not resolve every parse error. Manual changes are still required before applying.
                  </p>
                ) : null}
              </section>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Run validation to inspect strict parse errors, duplicate keys, and repairable JSON-like syntax.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ValidationSummary({ report }: { report: JsonValidationReport }) {
  const validWithoutWarnings = report.strictValid && report.warningCount === 0
  const validWithWarnings = report.strictValid && report.warningCount > 0

  return (
    <div className="flex flex-wrap items-center gap-2" aria-live="polite">
      <Badge
        variant={report.strictValid ? "outline" : "destructive"}
        className={
          validWithoutWarnings
            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            : validWithWarnings
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : undefined
        }
      >
        {validWithoutWarnings ? (
          <CheckCircle2Icon data-icon="inline-start" />
        ) : (
          <ShieldAlertIcon data-icon="inline-start" />
        )}
        {report.strictValid ? "Strict JSON valid" : "Strict JSON invalid"}
      </Badge>
      <Badge variant="outline">{report.errorCount.toLocaleString()} errors</Badge>
      <Badge variant="outline">{report.warningCount.toLocaleString()} warnings</Badge>
      {report.repairCount ? (
        <Badge variant="outline">{report.repairCount.toLocaleString()} proposed edits</Badge>
      ) : null}
      <span className="text-xs text-muted-foreground">{report.summary}</span>
    </div>
  )
}

function IssueTable({ issues }: { issues: JsonValidationIssue[] }) {
  return (
    <div className="max-h-80 overflow-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-24">Severity</TableHead>
            <TableHead className="min-w-80">Issue</TableHead>
            <TableHead className="w-32">Location</TableHead>
            <TableHead className="min-w-52">Path</TableHead>
            <TableHead className="w-24">Repair</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id}>
              <TableCell>
                <Badge variant={issue.severity === "error" ? "destructive" : "outline"}>
                  {issue.severity}
                </Badge>
              </TableCell>
              <TableCell className="text-sm">{issue.message}</TableCell>
              <TableCell className="font-mono text-xs">
                {issue.line}:{issue.column}
              </TableCell>
              <TableCell className="font-mono text-xs">{issue.path}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {issue.repairable ? "Previewed" : "Manual"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function createReportJson(report: JsonValidationReport, sourceJson: string) {
  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      documentBytes: new Blob([sourceJson]).size,
      strictValid: report.strictValid,
      repairCandidateValid: report.repairCandidateValid,
      summary: report.summary,
      counts: {
        errors: report.errorCount,
        warnings: report.warningCount,
        proposedEdits: report.repairCount,
      },
      affectedPaths: Array.from(new Set(report.issues.map((issue) => issue.path))),
      issues: report.issues.map((issue) => ({
        kind: issue.kind,
        severity: issue.severity,
        message: issue.message,
        line: issue.line,
        column: issue.column,
        length: issue.length,
        path: issue.path,
        repairable: issue.repairable,
      })),
    },
    null,
    2
  )
}
